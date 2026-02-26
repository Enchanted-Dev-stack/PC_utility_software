import type { ConnectionStateSnapshot } from "../../connectivity/session/useReconnectFlow";

export type ActionGateReason = "none" | "reconnecting" | "disconnected";

export interface ActionTilesGateModel {
  disabled: boolean;
  reason: ActionGateReason;
  hint: string;
}

export function buildActionTilesGateModel(state: ConnectionStateSnapshot): ActionTilesGateModel {
  if (state.state === "connected") {
    return {
      disabled: false,
      reason: "none",
      hint: "Controls are live."
    };
  }

  if (state.state === "reconnecting") {
    return {
      disabled: true,
      reason: "reconnecting",
      hint: "Reconnecting to your trusted PC. Controls unlock automatically once connected."
    };
  }

  return {
    disabled: true,
    reason: "disconnected",
    hint: "Connection is offline. Reconnect before sending control actions."
  };
}
