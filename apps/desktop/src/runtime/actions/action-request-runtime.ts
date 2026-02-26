import {
  SessionAuthGuard,
  type ActionRequestEnvelope,
  type UnauthorizedReason
} from "../../connectivity/session/session-auth-guard";
import type {
  ActionCommand,
  ActionType,
  MediaControlCommand,
  OpenAppActionCommand,
  OpenWebsiteActionCommand
} from "../../../../../shared/src/contracts/actions/action-command";
import type { ActionTerminalFeedback } from "../../../../../shared/src/contracts/actions/action-feedback";
import { ActionFeedbackEvents, type ActionFeedbackListener } from "./action-feedback-events";
import { ActionHistoryStore, type ActionHistoryEntry } from "./action-history-store";
import {
  ActionRuntimeOrchestrator,
  type ActionOrchestratorResult
} from "./action-orchestrator";
import { isRegisteredActionType } from "./action-registry";

export interface ActionCommandEnvelope extends ActionRequestEnvelope {
  actionId: string;
  actionType: string;
  payload?: Record<string, unknown>;
  requestedAt?: string;
}

export type ActionDispatchResult = {
  accepted: true;
  actionId: string;
  status: "dispatched" | "completed";
  deduplicated?: boolean;
  terminal?: ActionTerminalFeedback;
};

export type ActionRequestResult =
  | ActionDispatchResult
  | {
      accepted: false;
      actionId: string;
      reason: UnauthorizedReason;
    };

export type ActionDispatcher = (command: ActionCommandEnvelope) => Promise<void>;

type RuntimeDispatcher = ActionDispatcher | ActionRuntimeOrchestrator;

export class ActionRequestRuntime {
  private readonly guard: SessionAuthGuard;
  private readonly runtime: RuntimeDispatcher;

  public constructor(guard: SessionAuthGuard, runtime: RuntimeDispatcher) {
    this.guard = guard;
    this.runtime = runtime;
  }

  public async handleAction(command: ActionCommandEnvelope): Promise<ActionRequestResult> {
    const authorized = await this.guard.authorizeAction(command);
    if (!authorized.authorized) {
      return {
        accepted: false,
        actionId: command.actionId,
        reason: authorized.reason
      };
    }

    if (this.runtime instanceof ActionRuntimeOrchestrator) {
      const normalized = normalizeActionCommand(command);
      if (!normalized) {
        return {
          accepted: true,
          actionId: command.actionId,
          status: "completed",
          deduplicated: false,
          terminal: toValidationFailure(command)
        };
      }

      return mapOrchestratorResult(await this.runtime.handleAction(normalized));
    }

    await this.runtime(command);
    return {
      accepted: true,
      actionId: command.actionId,
      status: "dispatched"
    };
  }

  public subscribeFeedback(listener: ActionFeedbackListener): () => void {
    if (!(this.runtime instanceof ActionRuntimeOrchestrator)) {
      return () => {
        return;
      };
    }

    return this.runtime.getFeedbackEvents().subscribe(listener);
  }

  public getFeedbackEvents(): ActionFeedbackEvents | null {
    if (!(this.runtime instanceof ActionRuntimeOrchestrator)) {
      return null;
    }

    return this.runtime.getFeedbackEvents();
  }

  public getHistoryStore(): ActionHistoryStore | null {
    if (!(this.runtime instanceof ActionRuntimeOrchestrator)) {
      return null;
    }

    return this.runtime.getHistoryStore();
  }

  public getRecentHistory(limit = 20): ActionHistoryEntry[] {
    const history = this.getHistoryStore();
    if (!history) {
      return [];
    }

    return history.list().slice(-Math.max(1, limit)).reverse();
  }
}

function normalizeActionCommand(command: ActionCommandEnvelope): ActionCommand | null {
  if (!isRegisteredActionType(command.actionType)) {
    return null;
  }

  const requestedAt = typeof command.requestedAt === "string"
    ? command.requestedAt
    : new Date().toISOString();

  const base = {
    actionId: command.actionId,
    deviceId: command.deviceId,
    hostId: command.hostId,
    sessionId: command.sessionId,
    requestedAt
  };

  if (command.actionType === "open_app") {
    const appId = asString(command.payload?.appId);
    if (!appId) {
      return null;
    }

    const typedCommand: OpenAppActionCommand = {
      ...base,
      actionType: "open_app",
      payload: { appId }
    };
    return typedCommand;
  }

  if (command.actionType === "open_website") {
    const url = asString(command.payload?.url);
    if (!url) {
      return null;
    }

    const typedCommand: OpenWebsiteActionCommand = {
      ...base,
      actionType: "open_website",
      payload: { url }
    };
    return typedCommand;
  }

  const mediaCommand = asMediaControlCommand(command.payload?.command);
  if (!mediaCommand) {
    return null;
  }

  return {
    ...base,
    actionType: "media_control",
    payload: {
      command: mediaCommand
    }
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asMediaControlCommand(value: unknown): MediaControlCommand | null {
  if (
    value === "play_pause" ||
    value === "next" ||
    value === "previous" ||
    value === "volume_up" ||
    value === "volume_down" ||
    value === "mute_toggle"
  ) {
    return value;
  }

  return null;
}

function mapOrchestratorResult(result: ActionOrchestratorResult): ActionRequestResult {
  if (!result.accepted) {
    return {
      accepted: false,
      actionId: result.actionId,
      reason: result.reason
    };
  }

  return {
    accepted: true,
    actionId: result.actionId,
    status: "completed",
    deduplicated: result.deduplicated,
    terminal: result.terminal
  };
}

function toValidationFailure(command: ActionCommandEnvelope): ActionTerminalFeedback {
  const emittedAt = new Date().toISOString();
  return {
    actionId: command.actionId,
    actionType: coerceActionType(command.actionType),
    deviceId: command.deviceId,
    hostId: command.hostId,
    sessionId: command.sessionId,
    requestedAt: typeof command.requestedAt === "string" ? command.requestedAt : emittedAt,
    emittedAt,
    stage: "failure",
    outcome: "failure",
    outcomeCode: "validation_failed",
    completedAt: emittedAt,
    error: {
      category: "validation",
      detailCode: "invalid_action_payload",
      message: "Action payload did not match a supported command envelope."
    }
  };
}

function coerceActionType(actionType: string): ActionType {
  return isRegisteredActionType(actionType) ? actionType : "open_app";
}
