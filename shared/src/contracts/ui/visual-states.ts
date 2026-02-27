import {
  VISUAL_REQUIRED_STATES,
  VISUAL_TOKENS,
  type VisualElevationTier,
  type VisualInteractionState,
  type VisualSemanticTone
} from "./visual-tokens";

export type VisualComponentKind = "tile" | "control" | "banner";

export interface VisualStateStyle {
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  focusRingColor: string;
  focusRingVisible: boolean;
  elevation: VisualElevationTier;
  opacity: number;
}

export interface VisualStateBundle {
  component: VisualComponentKind;
  tone: VisualSemanticTone;
  states: Record<VisualInteractionState, VisualStateStyle>;
}

export function resolveVisualStateBundle(
  component: VisualComponentKind,
  tone: VisualSemanticTone
): VisualStateBundle {
  const semantic = VISUAL_TOKENS.semantic[tone];
  const errorSemantic = VISUAL_TOKENS.semantic.error;

  const baseElevation = component === "tile" ? "raised" : "base";

  const states: Record<VisualInteractionState, VisualStateStyle> = {
    default: {
      backgroundColor: semantic.soft,
      borderColor: semantic.border,
      textColor: semantic.foreground,
      focusRingColor: semantic.focusRing,
      focusRingVisible: false,
      elevation: baseElevation,
      opacity: 1
    },
    hover: {
      backgroundColor: semantic.soft,
      borderColor: semantic.solid,
      textColor: semantic.foreground,
      focusRingColor: semantic.focusRing,
      focusRingVisible: false,
      elevation: component === "banner" ? "base" : "raised",
      opacity: 1
    },
    focus: {
      backgroundColor: semantic.soft,
      borderColor: semantic.solid,
      textColor: semantic.foreground,
      focusRingColor: semantic.focusRing,
      focusRingVisible: true,
      elevation: "focused",
      opacity: 1
    },
    active: {
      backgroundColor: semantic.solid,
      borderColor: semantic.solid,
      textColor: "#FFFFFF",
      focusRingColor: semantic.focusRing,
      focusRingVisible: false,
      elevation: component === "tile" ? "raised" : "base",
      opacity: 1
    },
    disabled: {
      backgroundColor: VISUAL_TOKENS.semantic.neutral.soft,
      borderColor: VISUAL_TOKENS.semantic.neutral.border,
      textColor: VISUAL_TOKENS.semantic.neutral.foreground,
      focusRingColor: VISUAL_TOKENS.semantic.neutral.focusRing,
      focusRingVisible: false,
      elevation: "base",
      opacity: 0.56
    },
    error: {
      backgroundColor: errorSemantic.soft,
      borderColor: errorSemantic.solid,
      textColor: errorSemantic.foreground,
      focusRingColor: errorSemantic.focusRing,
      focusRingVisible: true,
      elevation: "focused",
      opacity: 1
    }
  };

  return {
    component,
    tone,
    states
  };
}

export function hasCompleteVisualStateCoverage(bundle: VisualStateBundle): boolean {
  return VISUAL_REQUIRED_STATES.every((state) => state in bundle.states);
}
