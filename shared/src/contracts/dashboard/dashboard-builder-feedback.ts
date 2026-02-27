export const DASHBOARD_BUILDER_FEEDBACK_OUTCOMES = ["success", "failure", "noop"] as const;

export const DASHBOARD_BUILDER_FEEDBACK_OPERATIONS = ["create", "update", "delete", "reorder", "save"] as const;

export type DashboardBuilderFeedbackOutcome = (typeof DASHBOARD_BUILDER_FEEDBACK_OUTCOMES)[number];

export type DashboardBuilderFeedbackOperation = (typeof DASHBOARD_BUILDER_FEEDBACK_OPERATIONS)[number];

export interface DashboardBuilderFeedbackIdentity {
  operation: DashboardBuilderFeedbackOperation;
  outcome: DashboardBuilderFeedbackOutcome;
  code?: string;
  targetTileId?: string;
}

export interface DashboardBuilderFeedback {
  id: string;
  operation: DashboardBuilderFeedbackOperation;
  outcome: DashboardBuilderFeedbackOutcome;
  message: string;
  dedupeKey: string;
  code?: string;
  targetTileId?: string;
}

export function createDashboardBuilderFeedbackIdentity(input: DashboardBuilderFeedbackIdentity): string {
  const code = input.code ?? "none";
  const targetTileId = input.targetTileId ?? "none";
  return `${input.operation}|${input.outcome}|${code}|${targetTileId}`;
}

export function createDashboardBuilderFeedback(input: {
  operation: DashboardBuilderFeedbackOperation;
  outcome: DashboardBuilderFeedbackOutcome;
  message: string;
  code?: string;
  targetTileId?: string;
}): DashboardBuilderFeedback {
  return {
    id: createDashboardBuilderFeedbackIdentity({
      operation: input.operation,
      outcome: input.outcome,
      code: input.code,
      targetTileId: input.targetTileId
    }),
    operation: input.operation,
    outcome: input.outcome,
    message: input.message,
    dedupeKey: createDashboardBuilderFeedbackIdentity({
      operation: input.operation,
      outcome: input.outcome,
      code: input.code,
      targetTileId: input.targetTileId
    }),
    code: input.code,
    targetTileId: input.targetTileId
  };
}
