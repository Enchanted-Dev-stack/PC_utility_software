export const VISUAL_TYPOGRAPHY_ROLES = [
  "title",
  "subtitle",
  "body",
  "label",
  "caption"
] as const;

export type VisualTypographyRole = (typeof VISUAL_TYPOGRAPHY_ROLES)[number];

export const VISUAL_SEMANTIC_TONES = ["neutral", "success", "warning", "error"] as const;
export type VisualSemanticTone = (typeof VISUAL_SEMANTIC_TONES)[number];

export const VISUAL_REQUIRED_STATES = [
  "default",
  "hover",
  "focus",
  "active",
  "disabled",
  "error"
] as const;

export type VisualInteractionState = (typeof VISUAL_REQUIRED_STATES)[number];

export const VISUAL_ELEVATION_TIERS = ["base", "raised", "focused", "overlay"] as const;
export type VisualElevationTier = (typeof VISUAL_ELEVATION_TIERS)[number];

export interface TypographyToken {
  fontSize: number;
  lineHeight: number;
  fontWeight: 400 | 500 | 600 | 700;
  letterSpacing: number;
}

export interface SemanticColorToken {
  solid: string;
  soft: string;
  border: string;
  foreground: string;
  focusRing: string;
}

export interface VisualTokens {
  typography: Record<VisualTypographyRole, TypographyToken>;
  spacing: {
    xs: number;
    sm: number;
    md: number;
    lg: number;
    xl: number;
  };
  radius: {
    sm: number;
    md: number;
    lg: number;
  };
  elevation: Record<VisualElevationTier, number>;
  semantic: Record<VisualSemanticTone, SemanticColorToken>;
}

export const VISUAL_TOKENS: VisualTokens = {
  typography: {
    title: { fontSize: 20, lineHeight: 28, fontWeight: 600, letterSpacing: 0 },
    subtitle: { fontSize: 16, lineHeight: 24, fontWeight: 600, letterSpacing: 0 },
    body: { fontSize: 14, lineHeight: 20, fontWeight: 400, letterSpacing: 0 },
    label: { fontSize: 13, lineHeight: 18, fontWeight: 500, letterSpacing: 0.2 },
    caption: { fontSize: 12, lineHeight: 16, fontWeight: 500, letterSpacing: 0.2 }
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 24
  },
  radius: {
    sm: 6,
    md: 10,
    lg: 14
  },
  elevation: {
    base: 0,
    raised: 1,
    focused: 2,
    overlay: 4
  },
  semantic: {
    neutral: {
      solid: "#334155",
      soft: "#F1F5F9",
      border: "#CBD5E1",
      foreground: "#0F172A",
      focusRing: "#0369A1"
    },
    success: {
      solid: "#15803D",
      soft: "#DCFCE7",
      border: "#86EFAC",
      foreground: "#14532D",
      focusRing: "#15803D"
    },
    warning: {
      solid: "#B45309",
      soft: "#FEF3C7",
      border: "#FCD34D",
      foreground: "#78350F",
      focusRing: "#92400E"
    },
    error: {
      solid: "#B91C1C",
      soft: "#FEE2E2",
      border: "#FCA5A5",
      foreground: "#7F1D1D",
      focusRing: "#B91C1C"
    }
  }
};
