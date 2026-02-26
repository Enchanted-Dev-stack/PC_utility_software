import type { PairingFlowState } from "./usePairingFlow";

export interface PairingScreenModel {
  title: string;
  subtitle: string;
  primaryActionLabel: string;
  modeLabel: string;
}

export function buildPairingScreenModel(state: PairingFlowState): PairingScreenModel {
  if (state.status === "approved") {
    return {
      title: "Pairing approved",
      subtitle: "This phone is now trusted for control actions.",
      primaryActionLabel: "Continue",
      modeLabel: state.mode === "qr" ? "QR pairing" : "Code pairing"
    };
  }

  if (state.status === "denied") {
    return {
      title: "Pairing denied",
      subtitle: state.failureReason
        ? `Desktop rejected this request: ${state.failureReason}.`
        : "Desktop rejected this request.",
      primaryActionLabel: "Try again",
      modeLabel: state.mode === "qr" ? "QR pairing" : "Code pairing"
    };
  }

  if (state.status === "pending") {
    return {
      title: "Awaiting desktop approval",
      subtitle: "Approve or deny this pairing on the PC before remote controls unlock.",
      primaryActionLabel: "Check status",
      modeLabel: state.mode === "qr" ? "QR pairing" : "Code pairing"
    };
  }

  return {
    title: "Pair your phone",
    subtitle: "Scan a QR code or enter the 6-digit pairing code from your PC.",
    primaryActionLabel: "Start pairing",
    modeLabel: "Choose pairing mode"
  };
}
