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

export interface DesktopSurfaceAppearance {
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

export interface DesktopControlPanelAppearance {
  canvasEmphasis: "primary";
  propertiesEmphasis: "secondary";
  previewEmphasis: "secondary";
}

export function createDesktopSurfaceAppearance(
  component: VisualComponentKind,
  tone: VisualSemanticTone = "neutral"
): DesktopSurfaceAppearance {
  const typographyRole: VisualTypographyRole = component === "banner" ? "body" : "label";
  const spacingRole = component === "control" ? "md" : "lg";

  return {
    typographyRole,
    spacingRole,
    radiusRole: component === "tile" ? "lg" : "md",
    semanticTone: tone,
    states: resolveVisualStateBundle(component, tone).states,
    accessibility: {
      typographyMinimum: toDesktopTypographyMinimum(typographyRole),
      minTargetSize: ACCESSIBILITY_TARGET_SIZE_MINIMUMS.desktop[component]
    }
  };
}

export function createDesktopTileAppearance(
  tone: VisualSemanticTone = "neutral"
): DesktopSurfaceAppearance {
  return createDesktopSurfaceAppearance("tile", tone);
}

export function createDesktopPreviewTileAppearance(
  tone: VisualSemanticTone = "neutral"
): DesktopSurfaceAppearance {
  return createDesktopSurfaceAppearance("tile", tone);
}

export function createDesktopControlPanelAppearance(): DesktopControlPanelAppearance {
  return {
    canvasEmphasis: "primary",
    propertiesEmphasis: "secondary",
    previewEmphasis: "secondary"
  };
}

export function mapDesktopToneToSemantic(
  tone: "positive" | "warning" | "critical"
): VisualSemanticTone {
  if (tone === "positive") {
    return "success";
  }
  if (tone === "warning") {
    return "warning";
  }
  return "error";
}

export const DESKTOP_THEME_VERSION = `${VISUAL_TOKENS.spacing.md}-${VISUAL_TOKENS.radius.md}`;

function toDesktopTypographyMinimum(role: VisualTypographyRole): TypographyMinimum {
  if (role === "caption") {
    return ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.desktop.caption;
  }
  if (role === "label") {
    return ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.desktop.label;
  }
  return ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.desktop.body;
}
