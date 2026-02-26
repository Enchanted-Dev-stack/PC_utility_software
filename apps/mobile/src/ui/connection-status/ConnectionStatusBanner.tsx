import type { ConnectionStateSnapshot } from "../../connectivity/session/useReconnectFlow";

export type ConnectionTone = "positive" | "warning" | "critical";

export interface ConnectionStatusBannerModel {
  label: "Connected" | "Reconnecting" | "Disconnected";
  tone: ConnectionTone;
  reasonHint: string;
  primaryActionLabel: string;
  showSwitchHost: boolean;
}

export function buildConnectionStatusBannerModel(
  state: ConnectionStateSnapshot
): ConnectionStatusBannerModel {
  if (state.state === "connected") {
    return {
      label: "Connected",
      tone: "positive",
      reasonHint: state.hostId
        ? `Connected to trusted host ${state.hostId}.`
        : "Connected to trusted host.",
      primaryActionLabel: "Connected",
      showSwitchHost: false
    };
  }

  if (state.state === "reconnecting") {
    return {
      label: "Reconnecting",
      tone: "warning",
      reasonHint: buildReconnectHint(state),
      primaryActionLabel: "Retry now",
      showSwitchHost: true
    };
  }

  return {
    label: "Disconnected",
    tone: "critical",
    reasonHint:
      state.reason === "retry_window_exhausted"
        ? "Reconnect attempts timed out. Choose a host and reconnect."
        : "Connection dropped. Reconnect to continue sending actions.",
    primaryActionLabel: "Reconnect",
    showSwitchHost: true
  };
}

function buildReconnectHint(state: ConnectionStateSnapshot): string {
  const hostLabel = state.hostId ? ` to ${state.hostId}` : "";
  return `Re-establishing trusted session${hostLabel}. Attempt ${state.retryAttempt + 1}.`;
}
