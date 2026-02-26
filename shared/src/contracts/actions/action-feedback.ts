import type { ActionType } from "./action-command";

export type ActionFeedbackStage = "received" | "running" | "success" | "failure";

export type ActionSuccessCode = "executed" | "deduplicated";

export type ActionFailureCode =
  | "authorization_denied"
  | "validation_failed"
  | "unsupported_action"
  | "execution_failed"
  | "runtime_error";

export type ActionErrorCategory = "authorization" | "validation" | "executor" | "runtime";

export interface ActionErrorTaxonomy {
  category: ActionErrorCategory;
  detailCode: string;
  message?: string;
}

export interface ActionFeedbackBase {
  actionId: string;
  actionType: ActionType;
  deviceId: string;
  hostId: string;
  sessionId: string;
  requestedAt: string;
  emittedAt: string;
}

export interface ActionReceivedFeedback extends ActionFeedbackBase {
  stage: "received";
}

export interface ActionRunningFeedback extends ActionFeedbackBase {
  stage: "running";
}

export interface ActionSuccessFeedback extends ActionFeedbackBase {
  stage: "success";
  outcome: "success";
  outcomeCode: ActionSuccessCode;
  completedAt: string;
}

export interface ActionFailureFeedback extends ActionFeedbackBase {
  stage: "failure";
  outcome: "failure";
  outcomeCode: ActionFailureCode;
  completedAt: string;
  error?: ActionErrorTaxonomy;
}

export type ActionTerminalFeedback = ActionSuccessFeedback | ActionFailureFeedback;

export type ActionFeedbackEvent =
  | ActionReceivedFeedback
  | ActionRunningFeedback
  | ActionSuccessFeedback
  | ActionFailureFeedback;
