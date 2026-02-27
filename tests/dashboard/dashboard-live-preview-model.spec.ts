import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import {
  createDashboardLivePreviewModel,
  createDashboardLivePreviewRuntimeHandlers
} from "../../apps/desktop/src/ui/dashboard/DashboardLivePreviewModel";
import { createMobileDashboardModel } from "../../apps/mobile/src/ui/dashboard/MobileDashboardModel";
import { MobileConnectivityClient } from "../../apps/mobile/src/runtime/connectivity/mobile-connectivity-client";

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
    expect(initial.tiles).toHaveLength(1);
    expect(initial.tiles[0]).toMatchObject({
      id: created.result.id,
      label: "Docs",
      icon: "browser",
      order: 0,
      actionSummary: "Open website: https://example.com/docs",
      appearance: {
        semanticTone: "neutral"
      }
    });

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

  it("normalizes projection ordering by order index and tile id", () => {
    const model = createDashboardLivePreviewModel({
      version: 9,
      updatedAt: "2026-02-27T12:00:00.000Z",
      tiles: [
        {
          id: "tile-c",
          label: "Third",
          icon: "media",
          order: 1,
          createdAt: "2026-02-27T12:00:00.000Z",
          updatedAt: "2026-02-27T12:00:00.000Z",
          action: {
            actionType: "media_control",
            payload: {
              command: "next"
            }
          }
        },
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
    expect(model.tiles.map((tile) => tile.id)).toEqual(["tile-a", "tile-b", "tile-c"]);
    expect(model.tiles.map((tile) => tile.order)).toEqual([0, 1, 2]);
  });
});

describe("mobile client subscription", () => {
  it("proxies runtime dashboard layout reads and subscriptions", () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");

    const updates: number[] = [];
    const unsubscribe = client.subscribeDashboardLayout((snapshot) => {
      updates.push(snapshot.version);
    });

    expect(updates).toEqual([0]);
    expect(client.getDashboardLayout().version).toBe(0);

    const created = runtime.createDashboardTile({
      label: "Music",
      icon: "media",
      action: {
        actionType: "media_control",
        payload: {
          command: "play_pause"
        }
      }
    });
    expect(created.ok).toBe(true);
    expect(updates).toEqual([0, 1]);

    const mobileModel = createMobileDashboardModel(client.getDashboardLayout());
    expect(mobileModel.layoutVersion).toBe(1);
    expect(mobileModel.tiles).toHaveLength(1);
    expect(mobileModel.tiles[0]).toMatchObject({
      label: "Music",
      actionSummary: "Media control: play_pause"
    });

    unsubscribe();

    runtime.updateDashboardTile(created.ok ? created.result.id : "", {
      label: "Ignored"
    });
    expect(updates).toEqual([0, 1]);
  });
});

describe("live preview synchronization", () => {
  it("keeps desktop and mobile models consistent from the same runtime snapshot", () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");

    const tileA = runtime.createDashboardTile({
      label: "Browser",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "https://example.com"
        }
      }
    });
    const tileB = runtime.createDashboardTile({
      label: "Apps",
      icon: "apps",
      action: {
        actionType: "open_app",
        payload: {
          appId: "notepad"
        }
      }
    });
    expect(tileA.ok).toBe(true);
    expect(tileB.ok).toBe(true);

    const reordered = runtime.reorderDashboardTiles({ fromIndex: 1, toIndex: 0 });
    expect(reordered.ok).toBe(true);

    const desktopModel = createDashboardLivePreviewModel(runtime.getDashboardLayout());
    const mobileModel = createMobileDashboardModel(client.getDashboardLayout());

    expect(desktopModel.layoutVersion).toBe(mobileModel.layoutVersion);
    expect(desktopModel.updatedAt).toBe(mobileModel.updatedAt);
    expect(desktopModel.tiles.map((tile) => tile.id)).toEqual(mobileModel.tiles.map((tile) => tile.id));
    expect(desktopModel.tiles.map((tile) => tile.icon)).toEqual(mobileModel.tiles.map((tile) => tile.icon));
    expect(desktopModel.tiles.map((tile) => tile.order)).toEqual(mobileModel.tiles.map((tile) => tile.order));
    expect(desktopModel.tiles.map((tile) => tile.actionSummary)).toEqual(
      mobileModel.tiles.map((tile) => tile.actionSummary)
    );
    expect(desktopModel.tiles.map((tile) => tile.label)).toEqual(mobileModel.tiles.map((tile) => tile.label));
    expect(desktopModel.tiles.map((tile) => tile.appearance.typographyRole)).toEqual(
      mobileModel.tiles.map((tile) => tile.appearance.typographyRole)
    );
    expect(desktopModel.tiles.map((tile) => tile.appearance.spacingRole)).toEqual(
      mobileModel.tiles.map((tile) => tile.appearance.spacingRole)
    );
    expect(desktopModel.tiles.map((tile) => tile.appearance.semanticTone)).toEqual(
      mobileModel.tiles.map((tile) => tile.appearance.semanticTone)
    );
    expect(
      desktopModel.tiles.map((tile) => Object.keys(tile.appearance.states).sort().join(","))
    ).toEqual(mobileModel.tiles.map((tile) => Object.keys(tile.appearance.states).sort().join(",")));
    expect(desktopModel.tiles.map((tile) => tile.label)).toEqual(["Apps", "Browser"]);
  });

  it("keeps parity deterministic when snapshot contains duplicate order values", () => {
    const snapshot = {
      version: 12,
      updatedAt: "2026-02-27T12:30:00.000Z",
      tiles: [
        {
          id: "tile-z",
          label: "Website",
          icon: "browser" as const,
          order: 2,
          createdAt: "2026-02-27T12:00:00.000Z",
          updatedAt: "2026-02-27T12:00:00.000Z",
          action: {
            actionType: "open_website" as const,
            payload: {
              url: "https://example.com"
            }
          }
        },
        {
          id: "tile-a",
          label: "Music",
          icon: "media" as const,
          order: 2,
          createdAt: "2026-02-27T12:00:00.000Z",
          updatedAt: "2026-02-27T12:00:00.000Z",
          action: {
            actionType: "media_control" as const,
            payload: {
              command: "play_pause" as const
            }
          }
        },
        {
          id: "tile-b",
          label: "Apps",
          icon: "apps" as const,
          order: 0,
          createdAt: "2026-02-27T12:00:00.000Z",
          updatedAt: "2026-02-27T12:00:00.000Z",
          action: {
            actionType: "open_app" as const,
            payload: {
              appId: "notepad"
            }
          }
        }
      ]
    };

    const desktopModel = createDashboardLivePreviewModel(snapshot);
    const mobileModel = createMobileDashboardModel(snapshot);

    expect(desktopModel.tiles.map((tile) => tile.id)).toEqual(["tile-b", "tile-a", "tile-z"]);
    expect(mobileModel.tiles.map((tile) => tile.id)).toEqual(["tile-b", "tile-a", "tile-z"]);
    expect(desktopModel.tiles.map((tile) => tile.order)).toEqual([0, 1, 2]);
    expect(mobileModel.tiles.map((tile) => tile.order)).toEqual([0, 1, 2]);
    expect(desktopModel.tiles.map((tile) => tile.actionSummary)).toEqual([
      "Open app: notepad",
      "Media control: play_pause",
      "Open website: https://example.com"
    ]);
    expect(desktopModel.tiles.map((tile) => tile.actionSummary)).toEqual(
      mobileModel.tiles.map((tile) => tile.actionSummary)
    );
  });

  it("prevents duplicate callback accumulation across unsubscribe and resubscribe cycles", () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");

    const seenVersions: number[] = [];

    const unsubscribeFirst = client.subscribeDashboardLayout((snapshot) => {
      seenVersions.push(snapshot.version);
    });
    unsubscribeFirst();

    const unsubscribeSecond = client.subscribeDashboardLayout((snapshot) => {
      seenVersions.push(snapshot.version);
    });

    const created = runtime.createDashboardTile({
      label: "Music",
      icon: "media",
      action: {
        actionType: "media_control",
        payload: {
          command: "play_pause"
        }
      }
    });
    expect(created.ok).toBe(true);
    unsubscribeSecond();

    const updatesOnly = seenVersions.filter((version) => version > 0);
    expect(updatesOnly).toEqual([1]);

    runtime.updateDashboardTile(created.ok ? created.result.id : "", {
      label: "No listener"
    });
    expect(seenVersions.filter((version) => version > 0)).toEqual([1]);
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
