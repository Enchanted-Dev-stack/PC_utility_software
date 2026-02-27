import type { ConnectionStateSnapshot } from "../../connectivity/session/useReconnectFlow";
import type { VisualSemanticTone } from "../../../../../shared/src/contracts/ui/visual-tokens";
import { createMobileSurfaceAppearance, mapMobileConnectionToSemantic } from "../visual-system/mobile-visual-theme";

export type ConnectionTone = "positive" | "warning" | "critical";

export interface ConnectionStatusBannerModel {
  label: "Connected" | "Reconnecting" | "Disconnected";
  tone: ConnectionTone;
  semanticTone: VisualSemanticTone;
  reasonHint: string;
  primaryActionLabel: string;
  showSwitchHost: boolean;
  appearance: ReturnType<typeof createMobileSurfaceAppearance>;
}

export function buildConnectionStatusBannerModel(
  state: ConnectionStateSnapshot
): ConnectionStatusBannerModel {
  if (state.state === "connected") {
    const semanticTone = mapMobileConnectionToSemantic(state.state);
    return {
      label: "Connected",
      tone: "positive",
      semanticTone,
      reasonHint: state.hostId
        ? `Connected to trusted host ${state.hostId}.`
        : "Connected to trusted host.",
      primaryActionLabel: "Connected",
      showSwitchHost: false,
      appearance: createMobileSurfaceAppearance("banner", semanticTone)
    };
  }

  if (state.state === "reconnecting") {
    const semanticTone = mapMobileConnectionToSemantic(state.state);
    return {
      label: "Reconnecting",
      tone: "warning",
      semanticTone,
      reasonHint: buildReconnectHint(state),
      primaryActionLabel: "Retry now",
      showSwitchHost: true,
      appearance: createMobileSurfaceAppearance("banner", semanticTone)
    };
  }

  const semanticTone = mapMobileConnectionToSemantic(state.state);
  return {
    label: "Disconnected",
    tone: "critical",
    semanticTone,
    reasonHint:
      state.reason === "retry_window_exhausted"
        ? "Reconnect attempts timed out. Choose a host and reconnect."
        : "Connection dropped. Reconnect to continue sending actions.",
    primaryActionLabel: "Reconnect",
    showSwitchHost: true,
    appearance: createMobileSurfaceAppearance("banner", semanticTone)
  };
}

function buildReconnectHint(state: ConnectionStateSnapshot): string {
  const hostLabel = state.hostId ? ` to ${state.hostId}` : "";
  return `Re-establishing trusted session${hostLabel}. Attempt ${state.retryAttempt + 1}.`;
}
