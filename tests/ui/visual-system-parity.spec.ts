import { createDashboardBuilderModelFromSnapshot } from "../../apps/desktop/src/ui/dashboard/DashboardBuilderModel";
import { createDashboardLivePreviewModel } from "../../apps/desktop/src/ui/dashboard/DashboardLivePreviewModel";
import { createMobileDashboardModel } from "../../apps/mobile/src/ui/dashboard/MobileDashboardModel";

describe("visual parity", () => {
  it("keeps shared semantic tone and state coverage across builder, preview, and mobile", () => {
    const snapshot = {
      version: 3,
      updatedAt: "2026-02-27T14:30:00.000Z",
      tiles: [
        {
          id: "tile-a",
          label: "Browser",
          icon: "browser" as const,
          order: 0,
          createdAt: "2026-02-27T14:30:00.000Z",
          updatedAt: "2026-02-27T14:30:00.000Z",
          action: {
            actionType: "open_website" as const,
            payload: {
              url: "https://example.com"
            }
          }
        }
      ]
    };

    const builder = createDashboardBuilderModelFromSnapshot(snapshot);
    const preview = createDashboardLivePreviewModel(snapshot);
    const mobile = createMobileDashboardModel(snapshot);

    const builderAppearance = builder.tiles[0].appearance;
    const previewAppearance = preview.tiles[0].appearance;
    const mobileAppearance = mobile.tiles[0].appearance;

    expect(builderAppearance.semanticTone).toBe("neutral");
    expect(previewAppearance.semanticTone).toBe("neutral");
    expect(mobileAppearance.semanticTone).toBe("neutral");

    const expectedStates = ["default", "hover", "focus", "active", "disabled", "error"].sort();
    expect(Object.keys(builderAppearance.states).sort()).toEqual(expectedStates);
    expect(Object.keys(previewAppearance.states).sort()).toEqual(expectedStates);
    expect(Object.keys(mobileAppearance.states).sort()).toEqual(expectedStates);

    expect(builderAppearance.states.focus.focusRingVisible).toBe(true);
    expect(previewAppearance.states.focus.focusRingVisible).toBe(true);
    expect(mobileAppearance.states.focus.focusRingVisible).toBe(true);
  });
});
