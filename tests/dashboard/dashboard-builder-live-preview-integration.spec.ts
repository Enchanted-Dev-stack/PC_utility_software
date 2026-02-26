import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { createDashboardBuilderRuntimeHandlers } from "../../apps/desktop/src/ui/dashboard/DashboardBuilderModel";
import { createDashboardLivePreviewRuntimeHandlers } from "../../apps/desktop/src/ui/dashboard/DashboardLivePreviewModel";

describe("dashboard builder reorder and save", () => {
  it("persists tile order after reorder and save", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    await handlers.createTile({
      label: "Browser",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com"
    });
    await handlers.createTile({
      label: "Music",
      icon: "media",
      actionType: "media_control",
      command: "play_pause"
    });
    await handlers.createTile({
      label: "Apps",
      icon: "apps",
      actionType: "open_app",
      appId: "notepad"
    });

    const beforeMove = await handlers.getModel();
    expect(beforeMove.tiles.map((tile) => tile.label)).toEqual(["Browser", "Music", "Apps"]);
    expect(beforeMove.isDirty).toBe(false);

    const moved = await handlers.moveTile({ fromIndex: 2, toIndex: 0 });
    expect(moved.ok).toBe(true);
    expect(moved.statusLabel).toBe("Tile order updated");
    expect(moved.model.tiles.map((tile) => tile.label)).toEqual(["Apps", "Browser", "Music"]);
    expect(moved.model.tiles.map((tile) => tile.order)).toEqual([0, 1, 2]);
    expect(moved.model.isDirty).toBe(true);

    const saved = await handlers.saveLayout();
    expect(saved.ok).toBe(true);
    expect(saved.statusLabel).toBe("Layout saved");
    expect(saved.model.tiles.map((tile) => tile.label)).toEqual(["Apps", "Browser", "Music"]);
    expect(saved.model.tiles.map((tile) => tile.order)).toEqual([0, 1, 2]);
    expect(saved.model.isDirty).toBe(false);

    const reloadedHandlers = createDashboardBuilderRuntimeHandlers(runtime);
    const reloaded = await reloadedHandlers.getModel();
    expect(reloaded.tiles.map((tile) => tile.label)).toEqual(["Apps", "Browser", "Music"]);
    expect(reloaded.tiles.map((tile) => tile.order)).toEqual([0, 1, 2]);
    expect(reloaded.isDirty).toBe(false);
  });
});

describe("live preview updates", () => {
  it("reflects create edit reorder and delete mutations immediately", async () => {
    const runtime = createRuntime();
    const builder = createDashboardBuilderRuntimeHandlers(runtime);
    const preview = createDashboardLivePreviewRuntimeHandlers(runtime);

    const labelsByUpdate: string[][] = [];
    const unsubscribe = preview.subscribe((model) => {
      labelsByUpdate.push(model.tiles.map((tile) => tile.label));
    });

    expect(labelsByUpdate).toEqual([[]]);

    const first = await builder.createTile({
      label: "Browser",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com"
    });
    expect(first.ok).toBe(true);
    if (!first.ok) {
      throw new Error("Expected first tile create success");
    }

    const second = await builder.createTile({
      label: "Music",
      icon: "media",
      actionType: "media_control",
      command: "play_pause"
    });
    expect(second.ok).toBe(true);
    if (!second.ok) {
      throw new Error("Expected second tile create success");
    }

    expect(labelsByUpdate[labelsByUpdate.length - 1]).toEqual(["Browser", "Music"]);

    const edited = await builder.updateTile({
      tileId: second.model.tiles[1].id,
      label: "Playback"
    });
    expect(edited.ok).toBe(true);
    expect(labelsByUpdate[labelsByUpdate.length - 1]).toEqual(["Browser", "Playback"]);

    const reordered = await builder.moveTile({ fromIndex: 1, toIndex: 0 });
    expect(reordered.ok).toBe(true);
    expect(labelsByUpdate[labelsByUpdate.length - 1]).toEqual(["Playback", "Browser"]);

    const deleted = await builder.deleteTile({ tileId: first.model.tiles[0].id });
    expect(deleted.ok).toBe(true);
    expect(labelsByUpdate[labelsByUpdate.length - 1]).toEqual(["Playback"]);

    const latestPreview = await preview.getModel();
    const latestBuilder = await builder.getModel();
    expect(latestPreview.tiles.map((tile) => tile.id)).toEqual(latestBuilder.tiles.map((tile) => tile.id));
    expect(latestPreview.tiles.map((tile) => tile.order)).toEqual([0]);

    unsubscribe();

    await builder.updateTile({
      tileId: latestBuilder.tiles[0].id,
      label: "No listener"
    });
    expect(labelsByUpdate[labelsByUpdate.length - 1]).toEqual(["Playback"]);
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
    return `2026-02-27T13:00:00.${String(tick).padStart(3, "0")}Z`;
  };
}
