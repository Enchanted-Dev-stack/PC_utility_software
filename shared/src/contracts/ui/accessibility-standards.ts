import type { VisualStateStyle } from "./visual-states";

export const ACCESSIBILITY_CONTRAST = {
  minFocusRingRatio: 3
} as const;

export const DESKTOP_PRIMARY_KEYBOARD_CONTROLS = [
  "tile-list",
  "tile-editor",
  "tile-reorder",
  "layout-save"
] as const;

export type DesktopPrimaryKeyboardControl =
  (typeof DESKTOP_PRIMARY_KEYBOARD_CONTROLS)[number];

export interface FocusVisibilityMetadata {
  focusRingVisible: boolean;
  focusRingColor: string;
  contrastRatio: number;
  minContrastRatio: number;
}

export interface KeyboardOperabilityMetadata {
  controls: readonly DesktopPrimaryKeyboardControl[];
  primaryPath: readonly DesktopPrimaryKeyboardControl[];
}

export type AccessibilitySurface = "desktop" | "mobile";

export interface TypographyMinimum {
  fontSize: number;
  lineHeight: number;
}

export interface TargetSizeMinimum {
  minWidth: number;
  minHeight: number;
}

export const ACCESSIBILITY_TYPOGRAPHY_MINIMUMS: Record<AccessibilitySurface, {
  body: TypographyMinimum;
  label: TypographyMinimum;
  caption: TypographyMinimum;
}> = {
  desktop: {
    body: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 13, lineHeight: 18 },
    caption: { fontSize: 12, lineHeight: 16 }
  },
  mobile: {
    body: { fontSize: 14, lineHeight: 20 },
    label: { fontSize: 13, lineHeight: 18 },
    caption: { fontSize: 12, lineHeight: 16 }
  }
};

export const ACCESSIBILITY_TARGET_SIZE_MINIMUMS: Record<AccessibilitySurface, {
  tile: TargetSizeMinimum;
  control: TargetSizeMinimum;
  banner: TargetSizeMinimum;
}> = {
  desktop: {
    tile: { minWidth: 44, minHeight: 44 },
    control: { minWidth: 32, minHeight: 32 },
    banner: { minWidth: 32, minHeight: 32 }
  },
  mobile: {
    tile: { minWidth: 48, minHeight: 48 },
    control: { minWidth: 44, minHeight: 44 },
    banner: { minWidth: 44, minHeight: 44 }
  }
};

export function toFocusVisibilityMetadata(
  focusState: Pick<VisualStateStyle, "focusRingVisible" | "focusRingColor" | "backgroundColor">,
  minContrastRatio = ACCESSIBILITY_CONTRAST.minFocusRingRatio
): FocusVisibilityMetadata {
  return {
    focusRingVisible: focusState.focusRingVisible,
    focusRingColor: focusState.focusRingColor,
    contrastRatio: measureContrastRatio(focusState.focusRingColor, focusState.backgroundColor),
    minContrastRatio
  };
}

export function isFocusVisibilityCompliant(metadata: FocusVisibilityMetadata): boolean {
  return metadata.focusRingVisible && metadata.contrastRatio >= metadata.minContrastRatio;
}

export function hasDesktopKeyboardCoverage(metadata: KeyboardOperabilityMetadata): boolean {
  const controlSet = new Set(metadata.controls);
  return DESKTOP_PRIMARY_KEYBOARD_CONTROLS.every((control) => controlSet.has(control));
}

export function meetsTypographyMinimum(
  typography: TypographyMinimum,
  minimum: TypographyMinimum
): boolean {
  return typography.fontSize >= minimum.fontSize && typography.lineHeight >= minimum.lineHeight;
}

export function meetsTargetSizeMinimum(
  target: TargetSizeMinimum,
  minimum: TargetSizeMinimum
): boolean {
  return target.minWidth >= minimum.minWidth && target.minHeight >= minimum.minHeight;
}

function measureContrastRatio(foregroundHex: string, backgroundHex: string): number {
  const foreground = relativeLuminance(parseHexColor(foregroundHex));
  const background = relativeLuminance(parseHexColor(backgroundHex));
  const lighter = Math.max(foreground, background);
  const darker = Math.min(foreground, background);
  return (lighter + 0.05) / (darker + 0.05);
}

function parseHexColor(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "").trim();
  const fullLength = normalized.length === 3
    ? normalized
      .split("")
      .map((value) => value + value)
      .join("")
    : normalized;

  if (fullLength.length !== 6) {
    throw new Error(`Unsupported hex color: ${hex}`);
  }

  const red = Number.parseInt(fullLength.slice(0, 2), 16);
  const green = Number.parseInt(fullLength.slice(2, 4), 16);
  const blue = Number.parseInt(fullLength.slice(4, 6), 16);
  return [red, green, blue];
}

function relativeLuminance([red, green, blue]: [number, number, number]): number {
  const linear = [red, green, blue].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];

  return (0.2126 * linear[0]) + (0.7152 * linear[1]) + (0.0722 * linear[2]);
}
