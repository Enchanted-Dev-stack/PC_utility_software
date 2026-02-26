import type {
  RuntimeConnectionStatusSnapshot,
  RuntimeHeaderStatus
} from "../../runtime/connectivity/desktop-connectivity-runtime";

export type DesktopConnectionTone = "positive" | "warning" | "critical";
export type DesktopTransitionState = "steady" | "fade-in" | "pulse";

export interface DesktopConnectionStatusToast {
  id: string;
  message: string;
}

export interface DesktopConnectionStatusBannerModel {
  label: "Connected" | "Reconnecting" | "Disconnected";
  tone: DesktopConnectionTone;
  reasonHint: string;
  transition: DesktopTransitionState;
  activeHostLabel: string;
  trustedIndicatorLabel: "Trusted" | "Untrusted";
  toast?: DesktopConnectionStatusToast;
}

export interface DesktopStatusEventInput {
  previous: RuntimeConnectionStatusSnapshot;
  current: RuntimeConnectionStatusSnapshot;
  header: RuntimeHeaderStatus;
  toastMessage?: string;
}

export function buildDesktopConnectionStatusBannerModel(
  input: DesktopStatusEventInput
): DesktopConnectionStatusBannerModel {
  const { current, previous, header, toastMessage } = input;

  if (current.state === "connected") {
    return {
      label: "Connected",
      tone: "positive",
      reasonHint: current.hostId
        ? `Connected to ${current.hostId}.`
        : "Connected to trusted host.",
      transition: previous.state === "connected" ? "steady" : "fade-in",
      activeHostLabel: header.activeHostLabel,
      trustedIndicatorLabel: header.trustedIndicator === "trusted" ? "Trusted" : "Untrusted",
      toast: toToast("connected", toastMessage)
    };
  }

  if (current.state === "reconnecting") {
    return {
      label: "Reconnecting",
      tone: "warning",
      reasonHint: current.hostId
        ? `Attempt ${current.retryAttempt + 1} to restore ${current.hostId}.`
        : `Attempt ${current.retryAttempt + 1} to restore connection.`,
      transition: "pulse",
      activeHostLabel: header.activeHostLabel,
      trustedIndicatorLabel: header.trustedIndicator === "trusted" ? "Trusted" : "Untrusted",
      toast: toToast("reconnecting", toastMessage)
    };
  }

  return {
    label: "Disconnected",
    tone: "critical",
    reasonHint:
      current.reason === "retry_window_exhausted"
        ? "Reconnect attempts timed out. Choose a host to retry."
        : "Connection dropped. Reconnect to continue desktop control.",
    transition: previous.state === "disconnected" ? "steady" : "fade-in",
    activeHostLabel: header.activeHostLabel,
    trustedIndicatorLabel: header.trustedIndicator === "trusted" ? "Trusted" : "Untrusted",
    toast: toToast("disconnected", toastMessage)
  };
}

function toToast(
  scope: "connected" | "reconnecting" | "disconnected",
  toastMessage?: string
): DesktopConnectionStatusToast | undefined {
  if (!toastMessage) {
    return undefined;
  }

  return {
    id: `desktop-status-${scope}`,
    message: toastMessage
  };
}
