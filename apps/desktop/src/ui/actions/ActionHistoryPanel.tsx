import type { ActionHistoryEntry } from "../../runtime/actions/action-history-store";
import type { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";

export type ActionOutcomeTone = "positive" | "critical";

export interface ActionHistoryRowModel {
  actionId: string;
  actionType: ActionHistoryEntry["actionType"];
  actionLabel: string;
  timestamp: string;
  outcome: "success" | "failure";
  outcomeCode: string;
  tone: ActionOutcomeTone;
}

export interface ActionHistoryPanelModel {
  title: string;
  subtitle: string;
  rows: ActionHistoryRowModel[];
  emptyStateLabel?: string;
}

export function buildActionHistoryPanelModel(
  entries: ActionHistoryEntry[],
  limit = 20
): ActionHistoryPanelModel {
  const rows = entries
    .slice(-Math.max(1, limit))
    .map((entry) => ({
      actionId: entry.actionId,
      actionType: entry.actionType,
      actionLabel: toActionLabel(entry.actionType),
      timestamp: entry.completedAt,
      outcome: entry.outcome,
      outcomeCode: entry.outcomeCode,
      tone: entry.outcome === "success" ? ("positive" as const) : ("critical" as const)
    }))
    .sort((left, right) => right.timestamp.localeCompare(left.timestamp));

  return {
    title: "Recent actions",
    subtitle: "Latest command outcomes from connected phones.",
    rows,
    emptyStateLabel: rows.length === 0 ? "No actions have been executed yet." : undefined
  };
}

export function createActionHistoryPanelRuntimeModel(
  runtime: DesktopConnectivityRuntime,
  limit = 20
): ActionHistoryPanelModel {
  return buildActionHistoryPanelModel(runtime.getRecentActionHistory(limit), limit);
}

function toActionLabel(actionType: ActionHistoryEntry["actionType"]): string {
  if (actionType === "open_app") {
    return "Open app";
  }

  if (actionType === "open_website") {
    return "Open website";
  }

  return "Media control";
}
