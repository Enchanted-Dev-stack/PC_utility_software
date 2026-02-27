import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import {
  createDashboardBuilderRuntimeHandlers,
  createDashboardBuilderRuntimeModel
} from "../../apps/desktop/src/ui/dashboard/DashboardBuilderModel";
import {
  DESKTOP_PRIMARY_KEYBOARD_CONTROLS,
  hasDesktopKeyboardCoverage,
  isFocusVisibilityCompliant
} from "../../shared/src/contracts/ui/accessibility-standards";

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
      statusLabel: "Tile created",
      feedback: {
        operation: "create",
        outcome: "success",
        message: "Tile created"
      }
    });
    expect(created.model.tiles).toHaveLength(1);
    expect(runtime.getDashboardLayout().tiles).toHaveLength(1);
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
    expect(created.model.tiles[0].appearance).toMatchObject({
      typographyRole: "label",
      spacingRole: "lg",
      semanticTone: "neutral"
    });
    expect(created.model.tiles[0].appearance.states.focus.focusRingVisible).toBe(true);
    expect(created.model.appearance.canvasEmphasis).toBe("primary");

    const tileId = created.model.tiles[0].id;
    expect(runtime.getDashboardLayout().tiles[0].id).toBe(tileId);

    const updated = await handlers.updateTile({
      tileId,
      label: "Media",
      icon: "media",
      actionType: "media_control",
      command: "play_pause"
    });

    expect(updated).toMatchObject({
      ok: true,
      statusLabel: "Tile updated",
      feedback: {
        operation: "update",
        outcome: "success",
        message: "Tile updated"
      }
    });
    expect(updated.model.tiles[0].id).toBe(tileId);
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
      statusLabel: "Tile deleted",
      feedback: {
        operation: "delete",
        outcome: "success",
        message: "Tile deleted"
      }
    });
    expect(deleted.model.tiles).toEqual([]);
    expect(runtime.getDashboardLayout().tiles).toEqual([]);
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
      code: "invalid_label",
      feedback: {
        operation: "create",
        outcome: "failure",
        message: "Tile label is required",
        code: "invalid_label"
      }
    });

    const missingTile = await handlers.updateTile({
      tileId: "tile-missing",
      label: "Won't apply"
    });
    expect(missingTile).toMatchObject({
      ok: false,
      statusLabel: "Tile not found",
      code: "not_found",
      feedback: {
        operation: "update",
        outcome: "failure",
        message: "Tile not found",
        code: "not_found"
      }
    });
  });

  it("keeps builder snapshots runtime-backed instead of mutating local arrays", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const created = await handlers.createTile({
      label: "Calculator",
      icon: "apps",
      actionType: "open_app",
      appId: "calculator"
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw new Error("Expected tile creation success");
    }

    const tileId = created.model.tiles[0].id;
    created.model.tiles[0].label = "Tampered local label";

    const runtimeModel = await handlers.getModel(tileId);
    expect(runtimeModel.tiles[0].label).toBe("Calculator");
    expect(runtimeModel.editor).toMatchObject({
      tileId,
      label: "Calculator",
      icon: "apps",
      action: {
        actionType: "open_app",
        appId: "calculator"
      }
    });
  });

  it("projects explicit interaction state across builder mutations", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const empty = await handlers.getModel();
    expect(empty.interaction).toEqual({
      selectedTileId: undefined,
      selectionValid: false,
      hasSelection: false,
      canReorder: false,
      canSave: false,
      editorMode: "create"
    });

    const first = await handlers.createTile({
      label: "Alpha",
      icon: "apps",
      actionType: "open_app",
      appId: "calculator"
    });
    const second = await handlers.createTile({
      label: "Beta",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com"
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const afterCreate = await handlers.getModel();
    expect(afterCreate.interaction.hasSelection).toBe(true);
    expect(afterCreate.interaction.selectionValid).toBe(true);
    expect(afterCreate.interaction.canReorder).toBe(true);
    expect(afterCreate.interaction.editorMode).toBe("edit");
    expect(afterCreate.interaction.canSave).toBe(false);

    const moved = await handlers.moveTile({ fromIndex: 1, toIndex: 0 });
    expect(moved.ok).toBe(true);
    expect(moved.model.interaction.canSave).toBe(true);

    const saved = await handlers.saveLayout();
    expect(saved.ok).toBe(true);
    expect(saved.model.interaction.canSave).toBe(false);
  });

  it("keeps interaction state coherent for invalid reorder, missing update, and delete fallback", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const first = await handlers.createTile({
      label: "One",
      icon: "apps",
      actionType: "open_app",
      appId: "calculator"
    });
    const second = await handlers.createTile({
      label: "Two",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com"
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);

    const selectedId = second.model.interaction.selectedTileId;
    const invalidMove = await handlers.moveTile({ fromIndex: 5, toIndex: 0 });
    expect(invalidMove.ok).toBe(false);
    expect(invalidMove.statusLabel).toBe("Tile reorder is invalid");
    expect(invalidMove.model.interaction.selectedTileId).toBe(selectedId);

    const missingUpdate = await handlers.updateTile({
      tileId: "missing",
      label: "Nope"
    });
    expect(missingUpdate.ok).toBe(false);
    expect(missingUpdate.model.interaction.selectedTileId).toBe(selectedId);

    const deleted = await handlers.deleteTile({ tileId: selectedId as string });
    expect(deleted.ok).toBe(true);
    expect(deleted.model.tiles).toHaveLength(1);
    expect(deleted.model.interaction.selectedTileId).toBe(deleted.model.tiles[0].id);
    expect(deleted.model.interaction.editorMode).toBe("edit");
  });

  it("reports no-op save state with explicit affordance flags", async () => {
    const runtime = createRuntime();
    const handlers = createDashboardBuilderRuntimeHandlers(runtime);

    const created = await handlers.createTile({
      label: "Save Check",
      icon: "apps",
      actionType: "open_app",
      appId: "calculator"
    });
    expect(created.ok).toBe(true);

    const firstSave = await handlers.saveLayout();
    expect(firstSave.ok).toBe(true);
    expect(firstSave.model.interaction.canSave).toBe(false);

    const secondSave = await handlers.saveLayout();
    expect(secondSave.ok).toBe(true);
    expect(secondSave.feedback.outcome).toBe("noop");
    expect(secondSave.feedback.message).toBe("Layout already saved");
    expect(secondSave.model.interaction.canSave).toBe(false);
  });

  it("publishes keyboard operability and contrast-safe focus metadata for primary controls", async () => {
    const runtime = createRuntime();
    const model = await createDashboardBuilderRuntimeModel(runtime);

    expect(model.accessibility.keyboard.controls).toEqual(DESKTOP_PRIMARY_KEYBOARD_CONTROLS);
    expect(model.accessibility.keyboard.primaryPath).toEqual(DESKTOP_PRIMARY_KEYBOARD_CONTROLS);
    expect(hasDesktopKeyboardCoverage(model.accessibility.keyboard)).toBe(true);

    for (const control of DESKTOP_PRIMARY_KEYBOARD_CONTROLS) {
      const metadata = model.accessibility.primaryControls[control];
      expect(metadata.keyboardOperable).toBe(true);
      expect(metadata.focus.focusRingVisible).toBe(true);
      expect(metadata.focus.contrastRatio).toBeGreaterThanOrEqual(metadata.focus.minContrastRatio);
      expect(isFocusVisibilityCompliant(metadata.focus)).toBe(true);
    }
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
