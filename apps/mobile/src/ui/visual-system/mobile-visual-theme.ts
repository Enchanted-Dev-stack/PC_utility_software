import {
  ACCESSIBILITY_TARGET_SIZE_MINIMUMS,
  ACCESSIBILITY_TYPOGRAPHY_MINIMUMS,
  type TargetSizeMinimum,
  type TypographyMinimum
} from "../../../../../shared/src/contracts/ui/accessibility-standards";
import {
  VISUAL_TOKENS,
  type VisualInteractionState,
  type VisualSemanticTone,
  type VisualTypographyRole
} from "../../../../../shared/src/contracts/ui/visual-tokens";
import {
  resolveVisualStateBundle,
  type VisualComponentKind,
  type VisualStateStyle
} from "../../../../../shared/src/contracts/ui/visual-states";

export interface MobileSurfaceAppearance {
  typographyRole: VisualTypographyRole;
  spacingRole: "sm" | "md" | "lg";
  radiusRole: "md" | "lg";
  semanticTone: VisualSemanticTone;
  states: Record<VisualInteractionState, VisualStateStyle>;
  accessibility: {
    typographyMinimum: TypographyMinimum;
    minTargetSize: TargetSizeMinimum;
  };
}

export function createMobileSurfaceAppearance(
  component: VisualComponentKind,
  tone: VisualSemanticTone = "neutral"
): MobileSurfaceAppearance {
  const typographyRole: VisualTypographyRole = component === "banner" ? "body" : "label";

  return {
    typographyRole,
    spacingRole: component === "tile" ? "lg" : "md",
    radiusRole: component === "tile" ? "lg" : "md",
    semanticTone: tone,
    states: resolveVisualStateBundle(component, tone).states,
    accessibility: {
      typographyMinimum: toMobileTypographyMinimum(typographyRole),
      minTargetSize: ACCESSIBILITY_TARGET_SIZE_MINIMUMS.mobile[component]
    }
  };
}

export function createMobileTileAppearance(
  tone: VisualSemanticTone = "neutral"
): MobileSurfaceAppearance {
  return createMobileSurfaceAppearance("tile", tone);
}

export function mapMobileConnectionToSemantic(
  state: "connected" | "reconnecting" | "disconnected"
): VisualSemanticTone {
  if (state === "connected") {
    return "success";
  }
  if (state === "reconnecting") {
    return "warning";
  }
  return "error";
}

export const MOBILE_THEME_VERSION = `${VISUAL_TOKENS.spacing.md}-${VISUAL_TOKENS.radius.md}`;

function toMobileTypographyMinimum(role: VisualTypographyRole): TypographyMinimum {
  if (role === "caption") {
    return ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.mobile.caption;
  }
  if (role === "label") {
    return ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.mobile.label;
  }
  return ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.mobile.body;
}
