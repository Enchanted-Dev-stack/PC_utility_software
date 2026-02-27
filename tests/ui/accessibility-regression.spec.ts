import { createDashboardBuilderModelFromSnapshot } from "../../apps/desktop/src/ui/dashboard/DashboardBuilderModel";
import { createDashboardLivePreviewModel } from "../../apps/desktop/src/ui/dashboard/DashboardLivePreviewModel";
import { createMobileDashboardModel } from "../../apps/mobile/src/ui/dashboard/MobileDashboardModel";
import {
  ACCESSIBILITY_TARGET_SIZE_MINIMUMS,
  DESKTOP_PRIMARY_KEYBOARD_CONTROLS,
  hasDesktopKeyboardCoverage,
  isFocusVisibilityCompliant,
  meetsTargetSizeMinimum,
  meetsTypographyMinimum
} from "../../shared/src/contracts/ui/accessibility-standards";
import { VISUAL_TOKENS } from "../../shared/src/contracts/ui/visual-tokens";

describe("accessibility regression gate", () => {
  it("keeps desktop builder primary controls keyboard-operable with visible contrast-safe focus", () => {
    const builder = createDashboardBuilderModelFromSnapshot(createSnapshot());

    expect(builder.accessibility.keyboard.controls).toEqual(DESKTOP_PRIMARY_KEYBOARD_CONTROLS);
    expect(hasDesktopKeyboardCoverage(builder.accessibility.keyboard)).toBe(true);

    for (const control of DESKTOP_PRIMARY_KEYBOARD_CONTROLS) {
      const metadata = builder.accessibility.primaryControls[control];
      expect(metadata.keyboardOperable).toBe(true);
      expect(isFocusVisibilityCompliant(metadata.focus)).toBe(true);
    }
  });

  it("keeps desktop and mobile accessibility floors for readable typography and control target size", () => {
    const snapshot = createSnapshot();
    const preview = createDashboardLivePreviewModel(snapshot);
    const mobile = createMobileDashboardModel(snapshot);

    expect(
      meetsTypographyMinimum(
        VISUAL_TOKENS.typography.body,
        VISUAL_TOKENS.accessibility.typographyMinimums.desktop.body
      )
    ).toBe(true);
    expect(
      meetsTypographyMinimum(
        VISUAL_TOKENS.typography.label,
        VISUAL_TOKENS.accessibility.typographyMinimums.mobile.label
      )
    ).toBe(true);

    expect(
      meetsTargetSizeMinimum(
        preview.tiles[0].appearance.accessibility.minTargetSize,
        ACCESSIBILITY_TARGET_SIZE_MINIMUMS.desktop.tile
      )
    ).toBe(true);
    expect(
      meetsTargetSizeMinimum(
        mobile.tiles[0].appearance.accessibility.minTargetSize,
        ACCESSIBILITY_TARGET_SIZE_MINIMUMS.mobile.tile
      )
    ).toBe(true);
  });
});

function createSnapshot() {
  return {
    version: 4,
    updatedAt: "2026-02-27T17:00:00.000Z",
    tiles: [
      {
        id: "tile-1",
        label: "Browser",
        icon: "browser" as const,
        order: 0,
        createdAt: "2026-02-27T17:00:00.000Z",
        updatedAt: "2026-02-27T17:00:00.000Z",
        action: {
          actionType: "open_website" as const,
          payload: {
            url: "https://example.com"
          }
        }
      }
    ]
  };
}
