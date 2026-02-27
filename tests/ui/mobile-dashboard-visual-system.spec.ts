import { createMobileDashboardModel } from "../../apps/mobile/src/ui/dashboard/MobileDashboardModel";
import { createDashboardLivePreviewModel } from "../../apps/desktop/src/ui/dashboard/DashboardLivePreviewModel";
import { buildActionTilesGateModel } from "../../apps/mobile/src/ui/controls/ActionTilesGate";
import { buildConnectionStatusBannerModel } from "../../apps/mobile/src/ui/connection-status/ConnectionStatusBanner";
import {
  ACCESSIBILITY_TARGET_SIZE_MINIMUMS,
  ACCESSIBILITY_TYPOGRAPHY_MINIMUMS,
  meetsTargetSizeMinimum,
  meetsTypographyMinimum
} from "../../shared/src/contracts/ui/accessibility-standards";
import { VISUAL_TOKENS } from "../../shared/src/contracts/ui/visual-tokens";

describe("mobile semantic mapping", () => {
  it("adds typography/spacing/state appearance metadata to mobile tiles", () => {
    const model = createMobileDashboardModel({
      version: 1,
      updatedAt: "2026-02-27T14:00:00.000Z",
      tiles: [
        {
          id: "tile-1",
          label: "Browser",
          icon: "browser",
          order: 0,
          createdAt: "2026-02-27T14:00:00.000Z",
          updatedAt: "2026-02-27T14:00:00.000Z",
          action: {
            actionType: "open_website",
            payload: {
              url: "https://example.com"
            }
          }
        }
      ]
    });

    expect(model.tiles[0].appearance.typographyRole).toBe("label");
    expect(model.tiles[0].appearance.spacingRole).toBe("lg");
    expect(model.tiles[0].appearance.states.focus.focusRingVisible).toBe(true);
    expect(model.tiles[0].appearance.states.disabled.opacity).toBeLessThan(1);
    expect(
      meetsTargetSizeMinimum(
        model.tiles[0].appearance.accessibility.minTargetSize,
        ACCESSIBILITY_TARGET_SIZE_MINIMUMS.mobile.tile
      )
    ).toBe(true);
    expect(
      meetsTypographyMinimum(
        VISUAL_TOKENS.typography.label,
        ACCESSIBILITY_TYPOGRAPHY_MINIMUMS.mobile.label
      )
    ).toBe(true);
  });

  it("maps connection gate and status banner to shared semantic tones", () => {
    const reconnectingGate = buildActionTilesGateModel({
      state: "reconnecting",
      hostId: "host-primary",
      reason: "connection_lost",
      retryAttempt: 1,
      retryWindowMs: 45000,
      canSwitchHost: true,
      canManualRetry: false
    });
    expect(reconnectingGate.semanticTone).toBe("warning");
    expect(reconnectingGate.appearance.states.focus.focusRingVisible).toBe(true);

    const disconnectedBanner = buildConnectionStatusBannerModel({
      state: "disconnected",
      hostId: "host-primary",
      reason: "retry_window_exhausted",
      retryAttempt: 3,
      retryWindowMs: 45000,
      canSwitchHost: true,
      canManualRetry: true
    });
    expect(disconnectedBanner.semanticTone).toBe("error");
    expect(disconnectedBanner.appearance.semanticTone).toBe("error");
  });

  it("keeps tile appearance roles and required state keys aligned with desktop preview", () => {
    const snapshot = {
      version: 3,
      updatedAt: "2026-02-27T14:10:00.000Z",
      tiles: [
        {
          id: "tile-1",
          label: "Browser",
          icon: "browser" as const,
          order: 0,
          createdAt: "2026-02-27T14:00:00.000Z",
          updatedAt: "2026-02-27T14:00:00.000Z",
          action: {
            actionType: "open_website" as const,
            payload: {
              url: "https://example.com"
            }
          }
        }
      ]
    };

    const mobileModel = createMobileDashboardModel(snapshot);
    const desktopModel = createDashboardLivePreviewModel(snapshot);

    expect(mobileModel.tiles.map((tile) => tile.appearance.typographyRole)).toEqual(
      desktopModel.tiles.map((tile) => tile.appearance.typographyRole)
    );
    expect(mobileModel.tiles.map((tile) => tile.appearance.spacingRole)).toEqual(
      desktopModel.tiles.map((tile) => tile.appearance.spacingRole)
    );
    expect(mobileModel.tiles.map((tile) => tile.appearance.semanticTone)).toEqual(
      desktopModel.tiles.map((tile) => tile.appearance.semanticTone)
    );
    expect(
      mobileModel.tiles.map((tile) => Object.keys(tile.appearance.states).sort().join(","))
    ).toEqual(
      desktopModel.tiles.map((tile) => Object.keys(tile.appearance.states).sort().join(","))
    );

    expect(typeof mobileModel.tiles[0].appearance.states.default.textColor).toBe("string");
    expect(mobileModel.tiles[0].appearance.states.focus.focusRingVisible).toBe(true);
    expect(mobileModel.tiles[0].appearance.states.disabled.opacity).toBeLessThan(1);
    expect(
      mobileModel.tiles[0].appearance.accessibility.minTargetSize
    ).toEqual(ACCESSIBILITY_TARGET_SIZE_MINIMUMS.mobile.tile);
    expect(
      desktopModel.tiles[0].appearance.accessibility.minTargetSize
    ).toEqual(ACCESSIBILITY_TARGET_SIZE_MINIMUMS.desktop.tile);
  });
});
