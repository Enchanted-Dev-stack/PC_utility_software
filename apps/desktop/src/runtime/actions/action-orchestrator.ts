import {
  SessionAuthGuard,
  type UnauthorizedReason
} from "../../connectivity/session/session-auth-guard";
import type {
  ActionCommand,
  ActionType,
  MediaControlActionCommand,
  OpenAppActionCommand,
  OpenWebsiteActionCommand
} from "../../../../../shared/src/contracts/actions/action-command";
import type {
  ActionFailureCode,
  ActionFeedbackEvent,
  ActionTerminalFeedback
} from "../../../../../shared/src/contracts/actions/action-feedback";
import { ActionFeedbackEvents } from "./action-feedback-events";
import {
  ActionHistoryStore,
  type ActionHistoryEntry
} from "./action-history-store";

export interface ActionExecutorResult {
  outcomeCode?: string;
  detailCode?: string;
}

export type OpenAppExecutor = (command: OpenAppActionCommand) => Promise<ActionExecutorResult>;
export type OpenWebsiteExecutor = (command: OpenWebsiteActionCommand) => Promise<ActionExecutorResult>;
export type MediaControlExecutor = (
  command: MediaControlActionCommand
) => Promise<ActionExecutorResult>;

export interface ActionExecutorMap {
  open_app: OpenAppExecutor;
  open_website: OpenWebsiteExecutor;
  media_control: MediaControlExecutor;
}

export interface ActionRuntimeOrchestratorConfig {
  guard: SessionAuthGuard;
  executors: ActionExecutorMap;
  feedback?: ActionFeedbackEvents;
  history?: ActionHistoryStore;
  now?: () => string;
}

export type ActionOrchestratorResult =
  | {
      accepted: false;
      actionId: string;
      reason: UnauthorizedReason;
    }
  | {
      accepted: true;
      actionId: string;
      deduplicated: boolean;
      terminal: ActionTerminalFeedback;
    };

export class ActionRuntimeOrchestrator {
  private readonly guard: SessionAuthGuard;
  private readonly executors: ActionExecutorMap;
  private readonly feedback: ActionFeedbackEvents;
  private readonly history: ActionHistoryStore;
  private readonly now: () => string;
  private readonly queueByScope: Map<string, Promise<void>>;
  private readonly inFlightByActionId: Map<string, Promise<ActionTerminalFeedback>>;
  private readonly terminalByActionId: Map<string, ActionTerminalFeedback>;

  public constructor(config: ActionRuntimeOrchestratorConfig) {
    this.guard = config.guard;
    this.executors = config.executors;
    this.feedback = config.feedback ?? new ActionFeedbackEvents();
    this.history = config.history ?? new ActionHistoryStore();
    this.now = config.now ?? (() => new Date().toISOString());
    this.queueByScope = new Map<string, Promise<void>>();
    this.inFlightByActionId = new Map<string, Promise<ActionTerminalFeedback>>();
    this.terminalByActionId = new Map<string, ActionTerminalFeedback>();
  }

  public getFeedbackEvents(): ActionFeedbackEvents {
    return this.feedback;
  }

  public getHistoryStore(): ActionHistoryStore {
    return this.history;
  }

  public async handleAction(command: ActionCommand): Promise<ActionOrchestratorResult> {
    const authorization = await this.guard.authorizeAction(command);
    if (!authorization.authorized) {
      return {
        accepted: false,
        actionId: command.actionId,
        reason: authorization.reason
      };
    }

    const completed = this.terminalByActionId.get(command.actionId);
    if (completed) {
      return {
        accepted: true,
        actionId: command.actionId,
        deduplicated: true,
        terminal: completed
      };
    }

    const inFlight = this.inFlightByActionId.get(command.actionId);
    if (inFlight) {
      return {
        accepted: true,
        actionId: command.actionId,
        deduplicated: true,
        terminal: await inFlight
      };
    }

    const receivedEvent = this.createEvent(command, "received");
    this.feedback.emit(receivedEvent);

    const scope = `${command.hostId}::${command.deviceId}`;
    const execution = this.enqueue(scope, async () => {
      this.feedback.emit(this.createEvent(command, "running"));
      return this.executeTerminal(command);
    });

    this.inFlightByActionId.set(command.actionId, execution);

    try {
      const terminal = await execution;
      return {
        accepted: true,
        actionId: command.actionId,
        deduplicated: false,
        terminal
      };
    } finally {
      this.inFlightByActionId.delete(command.actionId);
    }
  }

  private async enqueue<T>(scope: string, work: () => Promise<T>): Promise<T> {
    const prior = this.queueByScope.get(scope) ?? Promise.resolve();
    let releaseNext: (() => void) | undefined;
    const marker = new Promise<void>((resolve) => {
      releaseNext = resolve;
    });

    this.queueByScope.set(scope, prior.then(() => marker));
    await prior;

    try {
      return await work();
    } finally {
      if (releaseNext) {
        releaseNext();
      }

      const current = this.queueByScope.get(scope);
      if (current === marker) {
        this.queueByScope.delete(scope);
      }
    }
  }

  private async executeTerminal(command: ActionCommand): Promise<ActionTerminalFeedback> {
    try {
      const result = await this.runExecutor(command);
      const terminal = this.createTerminalEvent(command, result);
      this.finalizeAction(command, terminal);
      return terminal;
    } catch (error) {
      const terminal = this.createFailureEvent(command, "execution_failed", error);
      this.finalizeAction(command, terminal);
      return terminal;
    }
  }

  private createTerminalEvent(
    command: ActionCommand,
    result: ActionExecutorResult
  ): ActionTerminalFeedback {
    const normalizedCode = result.outcomeCode ?? "success";
    if (normalizedCode === "success" || normalizedCode === "executed") {
      return this.createSuccessEvent(command, normalizedCode);
    }

    const failureCode = this.mapFailureCode(normalizedCode);
    const completedAt = this.now();
    return {
      actionId: command.actionId,
      actionType: command.actionType,
      deviceId: command.deviceId,
      hostId: command.hostId,
      sessionId: command.sessionId,
      requestedAt: command.requestedAt,
      emittedAt: completedAt,
      stage: "failure",
      outcome: "failure",
      outcomeCode: failureCode,
      completedAt,
      error: {
        category: failureCode === "validation_failed" ? "validation" : "executor",
        detailCode: result.detailCode ?? normalizedCode,
        message: `Executor reported ${normalizedCode}`
      }
    };
  }

  private async runExecutor(command: ActionCommand): Promise<ActionExecutorResult> {
    switch (command.actionType) {
      case "open_app":
        return this.executors.open_app(command);
      case "open_website":
        return this.executors.open_website(command);
      case "media_control":
        return this.executors.media_control(command);
      default:
        return this.assertNever(command);
    }
  }

  private finalizeAction(command: ActionCommand, terminal: ActionTerminalFeedback): void {
    this.feedback.emit(terminal);
    this.terminalByActionId.set(command.actionId, terminal);
    this.history.append(this.toHistoryEntry(terminal));
  }

  private createEvent(
    command: ActionCommand,
    stage: "received" | "running"
  ): Extract<ActionFeedbackEvent, { stage: typeof stage }> {
    return {
      actionId: command.actionId,
      actionType: command.actionType,
      deviceId: command.deviceId,
      hostId: command.hostId,
      sessionId: command.sessionId,
      requestedAt: command.requestedAt,
      emittedAt: this.now(),
      stage
    };
  }

  private createSuccessEvent(command: ActionCommand, outcomeCode?: string): ActionTerminalFeedback {
    const completedAt = this.now();
    return {
      actionId: command.actionId,
      actionType: command.actionType,
      deviceId: command.deviceId,
      hostId: command.hostId,
      sessionId: command.sessionId,
      requestedAt: command.requestedAt,
      emittedAt: completedAt,
      stage: "success",
      outcome: "success",
      outcomeCode: outcomeCode === "deduplicated" ? "deduplicated" : "executed",
      completedAt
    };
  }

  private mapFailureCode(outcomeCode: string): ActionFailureCode {
    if (outcomeCode === "invalid_payload" || outcomeCode === "invalid_url" || outcomeCode === "app_not_found") {
      return "validation_failed";
    }

    if (outcomeCode === "unsupported_platform") {
      return "unsupported_action";
    }

    return "execution_failed";
  }

  private createFailureEvent(
    command: ActionCommand,
    outcomeCode: ActionFailureCode,
    error: unknown
  ): ActionTerminalFeedback {
    const completedAt = this.now();
    const message = error instanceof Error ? error.message : "Unknown runtime error";
    return {
      actionId: command.actionId,
      actionType: command.actionType,
      deviceId: command.deviceId,
      hostId: command.hostId,
      sessionId: command.sessionId,
      requestedAt: command.requestedAt,
      emittedAt: completedAt,
      stage: "failure",
      outcome: "failure",
      outcomeCode,
      completedAt,
      error: {
        category: "executor",
        detailCode: outcomeCode,
        message
      }
    };
  }

  private toHistoryEntry(terminal: ActionTerminalFeedback): ActionHistoryEntry {
    const errorCategory = terminal.stage === "failure" ? terminal.error?.category : undefined;

    return {
      actionId: terminal.actionId,
      actionType: terminal.actionType,
      deviceId: terminal.deviceId,
      hostId: terminal.hostId,
      sessionId: terminal.sessionId,
      requestedAt: terminal.requestedAt,
      completedAt: terminal.completedAt,
      outcome: terminal.outcome,
      outcomeCode: terminal.outcomeCode,
      errorCategory
    };
  }

  private assertNever(value: never): never {
    throw new Error(`Unsupported action type: ${String(value)}`);
  }
}
