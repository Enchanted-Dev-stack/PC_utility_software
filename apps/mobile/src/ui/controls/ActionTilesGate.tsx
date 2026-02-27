import type { ConnectionStateSnapshot } from "../../connectivity/session/useReconnectFlow";
import type { VisualSemanticTone } from "../../../../../shared/src/contracts/ui/visual-tokens";
import { createMobileSurfaceAppearance, mapMobileConnectionToSemantic } from "../visual-system/mobile-visual-theme";

export type ActionGateReason = "none" | "reconnecting" | "disconnected";

export interface ActionTilesGateModel {
  disabled: boolean;
  reason: ActionGateReason;
  hint: string;
  semanticTone: VisualSemanticTone;
  appearance: ReturnType<typeof createMobileSurfaceAppearance>;
}

export function buildActionTilesGateModel(state: ConnectionStateSnapshot): ActionTilesGateModel {
  if (state.state === "connected") {
    const semanticTone = mapMobileConnectionToSemantic(state.state);
    return {
      disabled: false,
      reason: "none",
      hint: "Controls are live.",
      semanticTone,
      appearance: createMobileSurfaceAppearance("control", semanticTone)
    };
  }

  if (state.state === "reconnecting") {
    const semanticTone = mapMobileConnectionToSemantic(state.state);
    return {
      disabled: true,
      reason: "reconnecting",
      hint: "Reconnecting to your trusted PC. Controls unlock automatically once connected.",
      semanticTone,
      appearance: createMobileSurfaceAppearance("control", semanticTone)
    };
  }

  const semanticTone = mapMobileConnectionToSemantic(state.state);
  return {
    disabled: true,
    reason: "disconnected",
    hint: "Connection is offline. Reconnect before sending control actions.",
    semanticTone,
    appearance: createMobileSurfaceAppearance("control", semanticTone)
  };
}
