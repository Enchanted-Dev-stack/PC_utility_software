import type {
  ActionFailureCode,
  ActionSuccessCode
} from "../../../../../shared/src/contracts/actions/action-feedback";
import type { ActionType } from "../../../../../shared/src/contracts/actions/action-command";

export type ActionHistoryOutcome = "success" | "failure";

export interface ActionHistoryEntry {
  actionId: string;
  actionType: ActionType;
  deviceId: string;
  hostId: string;
  sessionId: string;
  requestedAt: string;
  completedAt: string;
  outcome: ActionHistoryOutcome;
  outcomeCode: ActionSuccessCode | ActionFailureCode;
  errorCategory?: string;
}

export class ActionHistoryStore {
  private readonly maxEntries: number;
  private readonly entries: ActionHistoryEntry[];

  public constructor(maxEntries = 100) {
    this.maxEntries = Math.max(1, maxEntries);
    this.entries = [];
  }

  public append(entry: ActionHistoryEntry): ActionHistoryEntry {
    this.entries.push({ ...entry });
    const overflow = this.entries.length - this.maxEntries;
    if (overflow > 0) {
      this.entries.splice(0, overflow);
    }

    return { ...entry };
  }

  public list(): ActionHistoryEntry[] {
    return this.entries.map((entry) => ({ ...entry }));
  }

  public getByActionId(actionId: string): ActionHistoryEntry | null {
    const found = this.entries.find((entry) => entry.actionId === actionId);
    return found ? { ...found } : null;
  }
}
