import {
  type DashboardLayoutSnapshot,
  validateDashboardTileCreateInput,
  validateDashboardTileUpdateInput
} from "../../shared/src/contracts/dashboard/dashboard-tile";
import { DashboardLayoutService } from "../../apps/desktop/src/runtime/dashboard/dashboard-layout-service";

describe("dashboard contract validation", () => {
  it("accepts create payloads for supported action mappings", () => {
    const created = validateDashboardTileCreateInput({
      label: " Browser  ",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "https://example.com/docs"
        }
      }
    });

    expect(created).toEqual({
      ok: true,
      value: {
        label: "Browser",
        icon: "browser",
        action: {
          actionType: "open_website",
          payload: {
            url: "https://example.com/docs"
          }
        }
      }
    });
  });

  it("rejects create payloads with invalid action payloads using explicit outcomes", () => {
    const invalidActionType = validateDashboardTileCreateInput({
      label: "Launch",
      icon: "apps",
      action: {
        actionType: "macro",
        payload: {}
      }
    });
    expect(invalidActionType).toEqual({
      ok: false,
      code: "invalid_action_type",
      message: "Action type must be one of: open_app, open_website, media_control."
    });

    const invalidPayload = validateDashboardTileCreateInput({
      label: "Media",
      icon: "media",
      action: {
        actionType: "media_control",
        payload: {
          command: "skip"
        }
      }
    });
    expect(invalidPayload).toEqual({
      ok: false,
      code: "invalid_action_payload",
      message:
        "media_control payload.command must be one of: play_pause, next, previous, volume_up, volume_down, mute_toggle."
    });

    const invalidUrl = validateDashboardTileCreateInput({
      label: "Site",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "ftp://example.com"
        }
      }
    });
    expect(invalidUrl).toEqual({
      ok: false,
      code: "invalid_action_payload",
      message: "open_website payload.url must be a valid http or https URL."
    });
  });

  it("rejects update payloads that make no changes", () => {
    const result = validateDashboardTileUpdateInput({});
    expect(result).toEqual({
      ok: false,
      code: "invalid_update_payload",
      message: "Update payload must provide at least one of: label, icon, action."
    });
  });
});

describe("dashboard store service operations", () => {
  it("creates, updates, reorders, and deletes tiles by stable tile id", () => {
    const service = createService();
    const eventSnapshots: DashboardLayoutSnapshot[] = [];
    const stop = service.subscribe((snapshot) => {
      eventSnapshots.push(snapshot);
    });

    const createdA = service.createTile({
      label: "Apps",
      icon: "apps",
      action: {
        actionType: "open_app",
        payload: {
          appId: "calculator"
        }
      }
    });
    expect(createdA.ok).toBe(true);
    if (!createdA.ok) {
      throw new Error("Expected first tile creation success");
    }
    expect(createdA.result.id).toBe("tile-1");

    const createdB = service.createTile({
      label: "Web",
      icon: "browser",
      action: {
        actionType: "open_website",
        payload: {
          url: "https://example.com"
        }
      }
    });
    expect(createdB.ok).toBe(true);
    if (!createdB.ok) {
      throw new Error("Expected second tile creation success");
    }
    expect(createdB.result.id).toBe("tile-2");

    const updated = service.updateTile(createdB.result.id, {
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
    if (!updated.ok) {
      throw new Error("Expected update success");
    }
    expect(updated.result.label).toBe("Music");
    expect(updated.result.id).toBe("tile-2");

    const reordered = service.reorderTiles({ fromIndex: 1, toIndex: 0 });
    expect(reordered.ok).toBe(true);
    if (!reordered.ok) {
      throw new Error("Expected reorder success");
    }
    expect(reordered.snapshot.tiles.map((tile) => ({ id: tile.id, order: tile.order }))).toEqual([
      { id: "tile-2", order: 0 },
      { id: "tile-1", order: 1 }
    ]);

    const deleted = service.deleteTile("tile-2");
    expect(deleted.ok).toBe(true);
    if (!deleted.ok) {
      throw new Error("Expected delete success");
    }

    const notFoundDelete = service.deleteTile("tile-unknown");
    expect(notFoundDelete).toEqual({
      ok: false,
      reason: "not_found",
      message: "Dashboard tile 'tile-unknown' was not found."
    });

    const current = service.getSnapshot();
    expect(current.tiles).toHaveLength(1);
    expect(current.tiles[0]).toMatchObject({
      id: "tile-1",
      label: "Apps",
      order: 0
    });
    expect(eventSnapshots).toHaveLength(5);
    stop();
  });

  it("returns explicit validation outcomes for invalid mutations", () => {
    const service = createService();

    const invalidCreate = service.createTile({
      label: "",
      icon: "apps",
      action: {
        actionType: "open_app",
        payload: {
          appId: "calculator"
        }
      }
    });
    expect(invalidCreate).toEqual({
      ok: false,
      reason: "validation_failed",
      code: "invalid_label",
      message: "Tile label must be a non-empty string up to 48 characters."
    });

    const invalidReorder = service.reorderTiles({ fromIndex: 0, toIndex: 2 });
    expect(invalidReorder).toEqual({
      ok: false,
      reason: "invalid_reorder",
      message: "Dashboard reorder indices are outside the tile range."
    });
  });
});

function createService(): DashboardLayoutService {
  let id = 0;
  let tick = 0;
  return new DashboardLayoutService({
    idFactory: () => {
      id += 1;
      return `tile-${id}`;
    },
    now: () => {
      tick += 1;
      return `2026-02-27T10:00:00.${String(tick).padStart(3, "0")}Z`;
    }
  });
}
