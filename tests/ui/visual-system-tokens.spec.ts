import {
  VISUAL_REQUIRED_STATES,
  VISUAL_SEMANTIC_TONES,
  VISUAL_TOKENS,
  VISUAL_TYPOGRAPHY_ROLES
} from "../../shared/src/contracts/ui/visual-tokens";
import {
  hasCompleteVisualStateCoverage,
  resolveVisualStateBundle
} from "../../shared/src/contracts/ui/visual-states";
import { createDesktopSurfaceAppearance } from "../../apps/desktop/src/ui/visual-system/desktop-visual-theme";
import { createMobileSurfaceAppearance } from "../../apps/mobile/src/ui/visual-system/mobile-visual-theme";

describe("shared token contract", () => {
  it("exposes full typography and spacing scales", () => {
    for (const role of VISUAL_TYPOGRAPHY_ROLES) {
      expect(VISUAL_TOKENS.typography[role]).toBeDefined();
      expect(VISUAL_TOKENS.typography[role].fontSize).toBeGreaterThan(0);
    }

    expect(VISUAL_TOKENS.spacing.xs).toBeLessThan(VISUAL_TOKENS.spacing.sm);
    expect(VISUAL_TOKENS.spacing.sm).toBeLessThan(VISUAL_TOKENS.spacing.md);
    expect(VISUAL_TOKENS.spacing.md).toBeLessThan(VISUAL_TOKENS.spacing.lg);
    expect(VISUAL_TOKENS.spacing.lg).toBeLessThan(VISUAL_TOKENS.spacing.xl);
  });

  it("contains required semantic roles and required interaction states", () => {
    for (const tone of VISUAL_SEMANTIC_TONES) {
      expect(VISUAL_TOKENS.semantic[tone]).toBeDefined();
      expect(VISUAL_TOKENS.semantic[tone].solid).toMatch(/^#/);
      expect(VISUAL_TOKENS.semantic[tone].focusRing).toMatch(/^#/);
    }

    const bundle = resolveVisualStateBundle("tile", "neutral");
    expect(hasCompleteVisualStateCoverage(bundle)).toBe(true);

    for (const state of VISUAL_REQUIRED_STATES) {
      expect(bundle.states[state]).toBeDefined();
    }
  });
});

describe("surface adapters", () => {
  it("preserves semantic/state naming parity across desktop and mobile adapters", () => {
    for (const tone of VISUAL_SEMANTIC_TONES) {
      const desktop = createDesktopSurfaceAppearance("tile", tone);
      const mobile = createMobileSurfaceAppearance("tile", tone);

      expect(desktop.semanticTone).toBe(tone);
      expect(mobile.semanticTone).toBe(tone);
      expect(Object.keys(desktop.states).sort()).toEqual(Object.keys(mobile.states).sort());
      expect(desktop.states.focus.focusRingVisible).toBe(true);
      expect(mobile.states.focus.focusRingVisible).toBe(true);
      expect(desktop.states.error.borderColor).toBe(VISUAL_TOKENS.semantic.error.solid);
      expect(mobile.states.error.borderColor).toBe(VISUAL_TOKENS.semantic.error.solid);
    }
  });
});
