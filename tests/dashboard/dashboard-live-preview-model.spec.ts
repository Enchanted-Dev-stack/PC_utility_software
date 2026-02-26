import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import {
  createDashboardLivePreviewModel,
  createDashboardLivePreviewRuntimeHandlers
} from "../../apps/desktop/src/ui/dashboard/DashboardLivePreviewModel";

describe("desktop live preview", () => {
  it("reads current runtime snapshot and streams updates", async () => {
    const runtime = createRuntime();

    const created = runtime.createDashboardTile({
      label: "Docs",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "https://example.com/docs"
        }
      }
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("Expected dashboard tile create success");
    }

    const handlers = createDashboardLivePreviewRuntimeHandlers(runtime);
    const initial = await handlers.getModel();
    expect(initial.layoutVersion).toBe(1);
    expect(initial.tiles).toEqual([
      {
        id: created.result.id,
        label: "Docs",
        icon: "browser",
        order: 0,
        actionSummary: "Open website: https://example.com/docs"
      }
    ]);

    const updates: string[] = [];
    const unsubscribe = handlers.subscribe((model) => {
      updates.push(model.tiles.map((tile) => tile.label).join(","));
    });

    const updated = runtime.updateDashboardTile(created.result.id, {
      label: "Music",
      icon: "media",
      action: {
        actionType: "media_control",
        payload: {
          command: "play_pause"
        }
      }
    });
    expect(updated.ok).toBe(true);
    expect(updates[updates.length - 1]).toBe("Music");

    unsubscribe();
    runtime.updateDashboardTile(created.result.id, {
      label: "Ignored"
    });
    expect(updates[updates.length - 1]).toBe("Music");
  });

  it("normalizes tile ordering by order index", () => {
    const model = createDashboardLivePreviewModel({
      version: 9,
      updatedAt: "2026-02-27T12:00:00.000Z",
      tiles: [
        {
          id: "tile-b",
          label: "Second",
          icon: "apps",
          order: 1,
          createdAt: "2026-02-27T12:00:00.000Z",
          updatedAt: "2026-02-27T12:00:00.000Z",
          action: {
            actionType: "open_app",
            payload: {
              appId: "notepad"
            }
          }
        },
        {
          id: "tile-a",
          label: "First",
          icon: "browser",
          order: 0,
          createdAt: "2026-02-27T12:00:00.000Z",
          updatedAt: "2026-02-27T12:00:00.000Z",
          action: {
            actionType: "open_website",
            payload: {
              url: "https://example.com"
            }
          }
        }
      ]
    });

    expect(model.layoutVersion).toBe(9);
    expect(model.tiles.map((tile) => tile.id)).toEqual(["tile-a", "tile-b"]);
  });
});

function createRuntime(): DesktopConnectivityRuntime {
  return new DesktopConnectivityRuntime({
    hostId: "host-primary",
    hostName: "Office-PC",
    hostDeviceId: "desktop-1",
    hostIpAddress: "192.168.1.10",
    now: createTickingNow()
  });
}

function createTickingNow(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-02-27T11:00:00.${String(tick).padStart(3, "0")}Z`;
  };
}
