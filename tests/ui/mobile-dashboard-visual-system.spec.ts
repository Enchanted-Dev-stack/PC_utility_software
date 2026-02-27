import { createMobileDashboardModel } from "../../apps/mobile/src/ui/dashboard/MobileDashboardModel";
import { buildActionTilesGateModel } from "../../apps/mobile/src/ui/controls/ActionTilesGate";
import { buildConnectionStatusBannerModel } from "../../apps/mobile/src/ui/connection-status/ConnectionStatusBanner";

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
});
