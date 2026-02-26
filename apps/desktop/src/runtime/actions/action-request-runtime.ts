import {
  SessionAuthGuard,
  type ActionRequestEnvelope,
  type UnauthorizedReason
} from "../../connectivity/session/session-auth-guard";

export interface ActionCommandEnvelope extends ActionRequestEnvelope {
  actionId: string;
  actionType: string;
  payload?: Record<string, unknown>;
}

export type ActionDispatchResult = {
  accepted: true;
  actionId: string;
  status: "dispatched";
};

export type ActionRequestResult =
  | ActionDispatchResult
  | {
      accepted: false;
      actionId: string;
      reason: UnauthorizedReason;
    };

export type ActionDispatcher = (command: ActionCommandEnvelope) => Promise<void>;

export class ActionRequestRuntime {
  private readonly guard: SessionAuthGuard;
  private readonly dispatcher: ActionDispatcher;

  public constructor(guard: SessionAuthGuard, dispatcher: ActionDispatcher) {
    this.guard = guard;
    this.dispatcher = dispatcher;
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

    await this.dispatcher(command);
    return {
      accepted: true,
      actionId: command.actionId,
      status: "dispatched"
    };
  }
}
