import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import {
  createDashboardBuilderRuntimeHandlers,
  createDashboardBuilderRuntimeModel
} from "../../apps/desktop/src/ui/dashboard/DashboardBuilderModel";

describe("dashboard builder model create update delete", () => {
  it("runs create update delete mutations with deterministic status labels", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const initial = await createDashboardBuilderRuntimeModel(runtime);
    expect(initial.tiles).toEqual([]);
    expect(initial.editor.action.actionType).toBe("open_app");

    const created = await handlers.createTile({
      label: "Docs",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com/docs"
    });

    expect(created).toMatchObject({
      ok: true,
      statusLabel: "Tile created"
    });
    expect(created.model.tiles).toHaveLength(1);
    expect(created.model.tiles[0]).toMatchObject({
      label: "Docs",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "https://example.com/docs"
        }
      }
    });

    const tileId = created.model.tiles[0].id;
    const updated = await handlers.updateTile({
      tileId,
      label: "Media",
      icon: "media",
      actionType: "media_control",
      command: "play_pause"
    });

    expect(updated).toMatchObject({
      ok: true,
      statusLabel: "Tile updated"
    });
    expect(updated.model.editor).toMatchObject({
      tileId,
      label: "Media",
      icon: "media",
      action: {
        actionType: "media_control",
        command: "play_pause"
      }
    });

    const deleted = await handlers.deleteTile({ tileId });
    expect(deleted).toMatchObject({
      ok: true,
      statusLabel: "Tile deleted"
    });
    expect(deleted.model.tiles).toEqual([]);
  });

  it("returns explicit labels for validation and missing-tile errors", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const invalidCreate = await handlers.createTile({
      label: "",
      icon: "apps",
      actionType: "open_app",
      appId: "calculator"
    });

    expect(invalidCreate).toMatchObject({
      ok: false,
      statusLabel: "Tile label is required",
      code: "invalid_label"
    });

    const missingTile = await handlers.updateTile({
      tileId: "tile-missing",
      label: "Won't apply"
    });
    expect(missingTile).toMatchObject({
      ok: false,
      statusLabel: "Tile not found",
      code: "not_found"
    });
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
    return `2026-02-27T12:00:00.${String(tick).padStart(3, "0")}Z`;
  };
}
