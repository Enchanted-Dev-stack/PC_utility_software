import { ACTION_TYPES, MEDIA_CONTROL_COMMANDS, type ActionType, type MediaControlCommand } from "../../../../../shared/src/contracts/actions/action-command";
import type { VisualSemanticTone } from "../../../../../shared/src/contracts/ui/visual-tokens";
import type {
  DashboardIconToken,
  DashboardLayoutSnapshot,
  DashboardTile,
  DashboardTileActionMapping,
  DashboardValidationCode
} from "../../../../../shared/src/contracts/dashboard/dashboard-tile";
import type {
  DashboardMutationError,
  DashboardMutationResult
} from "../../runtime/dashboard/dashboard-layout-service";
import {
  createDashboardBuilderFeedback,
  type DashboardBuilderFeedback,
  type DashboardBuilderFeedbackOperation
} from "../../../../../shared/src/contracts/dashboard/dashboard-builder-feedback";
import { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";
import {
  createDesktopControlPanelAppearance,
  createDesktopTileAppearance,
  type DesktopControlPanelAppearance,
  type DesktopSurfaceAppearance
} from "../visual-system/desktop-visual-theme";

type MutationKind = "create" | "update" | "delete";

export interface DashboardBuilderActionEditorState {
  actionType: ActionType;
  appId: string;
  arguments: string[];
  url: string;
  command: MediaControlCommand;
  value?: number;
}

export interface DashboardBuilderEditorState {
  tileId?: string;
  label: string;
  icon: DashboardIconToken;
  action: DashboardBuilderActionEditorState;
}

export interface DashboardBuilderTileModel {
  id: string;
  label: string;
  icon: DashboardIconToken;
  order: number;
  action: DashboardTileActionMapping;
  appearance: DesktopSurfaceAppearance;
}

export interface DashboardBuilderRuntimeModel {
  tiles: DashboardBuilderTileModel[];
  editor: DashboardBuilderEditorState;
  isDirty: boolean;
  interaction: DashboardBuilderInteractionState;
  latestFeedback?: DashboardBuilderFeedback;
  appearance: DesktopControlPanelAppearance;
}

export interface DashboardBuilderInteractionState {
  selectedTileId?: string;
  selectionValid: boolean;
  hasSelection: boolean;
  canReorder: boolean;
  canSave: boolean;
  editorMode: "create" | "edit";
}

export interface DashboardBuilderCreateTileInput {
  label: string;
  icon: DashboardIconToken;
  actionType: ActionType;
  appId?: string;
  arguments?: string[];
  url?: string;
  command?: MediaControlCommand;
  value?: number;
}

export interface DashboardBuilderUpdateTileInput {
  tileId: string;
  label?: string;
  icon?: DashboardIconToken;
  actionType?: ActionType;
  appId?: string;
  arguments?: string[];
  url?: string;
  command?: MediaControlCommand;
  value?: number;
}

export interface DashboardBuilderDeleteTileInput {
  tileId: string;
}

export interface DashboardBuilderMoveTileInput {
  fromIndex: number;
  toIndex: number;
}

export interface DashboardBuilderMutationResult {
  ok: boolean;
  statusLabel: string;
  feedback: DashboardBuilderFeedback;
  model: DashboardBuilderRuntimeModel;
  code?: DashboardValidationCode | "not_found" | "invalid_reorder";
}

export interface DashboardBuilderRuntimeHandlers {
  getModel(selectedTileId?: string): Promise<DashboardBuilderRuntimeModel>;
  createTile(input: DashboardBuilderCreateTileInput): Promise<DashboardBuilderMutationResult>;
  updateTile(input: DashboardBuilderUpdateTileInput): Promise<DashboardBuilderMutationResult>;
  deleteTile(input: DashboardBuilderDeleteTileInput): Promise<DashboardBuilderMutationResult>;
  moveTile(input: DashboardBuilderMoveTileInput): Promise<DashboardBuilderMutationResult>;
  saveLayout(selectedTileId?: string): Promise<DashboardBuilderMutationResult>;
}

export async function createDashboardBuilderRuntimeModel(
  runtime: DesktopConnectivityRuntime,
  selectedTileId?: string
): Promise<DashboardBuilderRuntimeModel> {
  return createDashboardBuilderModelFromSnapshot(runtime.getDashboardLayout(), selectedTileId, false);
}

export function createDashboardBuilderRuntimeHandlers(
  runtime: DesktopConnectivityRuntime
): DashboardBuilderRuntimeHandlers {
  let selectedTileId: string | undefined;
  let latestFeedback: DashboardBuilderFeedback | undefined;
  let savedOrderIds = toBuilderTiles(runtime.getDashboardLayout()).map((tile) => tile.id);

  const syncFromRuntime = (
    nextSelectedTileId?: string,
    options: {
      resetDirty?: boolean;
    } = {}
  ): DashboardBuilderRuntimeModel => {
    const snapshot = runtime.getDashboardLayout();
    if (options.resetDirty) {
      savedOrderIds = toBuilderTiles(snapshot).map((tile) => tile.id);
    }
    selectedTileId = nextSelectedTileId;
    return withLatestFeedback(createModelFromRuntimeSnapshot(snapshot));
  };

  const createModelFromRuntimeSnapshot = (snapshot: DashboardLayoutSnapshot): DashboardBuilderRuntimeModel => {
    const tiles = toBuilderTiles(snapshot);
    const isDirty = !hasSameTileOrderIds(tiles, savedOrderIds);
    return createDashboardBuilderModel(tiles, selectedTileId, isDirty, latestFeedback);
  };

  const currentModel = (): DashboardBuilderRuntimeModel => {
    return withLatestFeedback(createModelFromRuntimeSnapshot(runtime.getDashboardLayout()));
  };

  const withLatestFeedback = (model: DashboardBuilderRuntimeModel): DashboardBuilderRuntimeModel => {
    return {
      ...model,
      latestFeedback
    };
  };

  const withMutationFeedback = (
    result: DashboardBuilderMutationResult
  ): DashboardBuilderMutationResult => {
    latestFeedback = result.feedback;
    return {
      ...result,
      model: {
        ...result.model,
        latestFeedback
      }
    };
  };

  const moveTile = (input: DashboardBuilderMoveTileInput): DashboardBuilderMutationResult => {
    const currentTiles = toBuilderTiles(runtime.getDashboardLayout());
    if (!isValidMoveIndex(input.fromIndex, currentTiles.length) || !isValidMoveIndex(input.toIndex, currentTiles.length)) {
      return withMutationFeedback({
        ok: false,
        statusLabel: "Tile reorder is invalid",
        feedback: createDashboardBuilderFeedback({
          operation: "reorder",
          outcome: "failure",
          message: "Tile reorder is invalid",
          code: "invalid_reorder"
        }),
        code: "invalid_reorder",
        model: currentModel()
      });
    }

    const movedTileId = currentTiles[input.fromIndex].id;
    const reordered = runtime.reorderDashboardTiles({
      fromIndex: input.fromIndex,
      toIndex: input.toIndex
    });
    if (!reordered.ok) {
      return withMutationFeedback(mapMutationError("reorder", reordered, currentModel()));
    }

    selectedTileId = movedTileId;

    return withMutationFeedback({
      ok: true,
      statusLabel: "Tile order updated",
      feedback: createDashboardBuilderFeedback({
        operation: "reorder",
        outcome: "success",
        message: "Tile order updated",
        targetTileId: movedTileId
      }),
      model: currentModel()
    });
  };

  const saveLayout = (): DashboardBuilderMutationResult => {
    const snapshot = runtime.getDashboardLayout();
    const dirty = !hasSameTileOrderIds(toBuilderTiles(snapshot), savedOrderIds);
    if (!dirty) {
      return withMutationFeedback({
        ok: true,
        statusLabel: "Layout already saved",
        feedback: createDashboardBuilderFeedback({
          operation: "save",
          outcome: "noop",
          message: "Layout already saved"
        }),
        model: currentModel()
      });
    }

    savedOrderIds = toBuilderTiles(snapshot).map((tile) => tile.id);

    return withMutationFeedback({
      ok: true,
      statusLabel: "Layout saved",
      feedback: createDashboardBuilderFeedback({
        operation: "save",
        outcome: "success",
        message: "Layout saved"
      }),
      model: syncFromRuntime(selectedTileId)
    });
  };

  return {
    getModel: async (nextSelectedTileId) => {
      selectedTileId = nextSelectedTileId;
      return currentModel();
    },
    createTile: async (input) => {
      const created = runtime.createDashboardTile(toCreatePayload(input));
      const nextSelectedTileId = created.ok ? created.result.id : selectedTileId;
      const model = created.ok
        ? syncFromRuntime(nextSelectedTileId, { resetDirty: true })
        : currentModel();
      return withMutationFeedback(
        mapMutationResult("create", created, model, created.ok ? created.result.id : undefined)
      );
    },
    updateTile: async (input) => {
      const snapshot = runtime.getDashboardLayout();
      const existing = snapshot.tiles.find((tile) => tile.id === input.tileId);
      const updated = runtime.updateDashboardTile(
        input.tileId,
        toUpdatePayload(input, existing)
      );
      const model = updated.ok
        ? syncFromRuntime(input.tileId, { resetDirty: true })
        : currentModel();
      return withMutationFeedback(mapMutationResult("update", updated, model, input.tileId));
    },
    deleteTile: async (input) => {
      const tilesBeforeDelete = toBuilderTiles(runtime.getDashboardLayout());
      const deletedIndex = tilesBeforeDelete.findIndex((tile) => tile.id === input.tileId);
      const deleted = runtime.deleteDashboardTile(input.tileId);
      let nextSelectedAfterDelete: string | undefined;
      if (deleted.ok) {
        const tilesAfterDelete = toBuilderTiles(runtime.getDashboardLayout());
        if (tilesAfterDelete.length > 0) {
          const fallbackIndex = deletedIndex < 0 ? 0 : Math.min(deletedIndex, tilesAfterDelete.length - 1);
          nextSelectedAfterDelete = tilesAfterDelete[fallbackIndex].id;
        }
      }
      const model = deleted.ok
        ? syncFromRuntime(nextSelectedAfterDelete, { resetDirty: true })
        : currentModel();
      return withMutationFeedback(mapMutationResult("delete", deleted, model, input.tileId));
    },
    moveTile: async (input) => moveTile(input),
    saveLayout: async (nextSelectedTileId) => {
      if (nextSelectedTileId !== undefined) {
        selectedTileId = nextSelectedTileId;
      }
      return saveLayout();
    }
  };
}

export function createDashboardBuilderModelFromSnapshot(
  snapshot: DashboardLayoutSnapshot,
  selectedTileId?: string,
  isDirty = false,
  latestFeedback?: DashboardBuilderFeedback
): DashboardBuilderRuntimeModel {
  const tiles = toBuilderTiles(snapshot);

  return createDashboardBuilderModel(tiles, selectedTileId, isDirty, latestFeedback);
}

function createDashboardBuilderModel(
  tiles: DashboardBuilderTileModel[],
  selectedTileId?: string,
  isDirty = false,
  latestFeedback?: DashboardBuilderFeedback
): DashboardBuilderRuntimeModel {
  const normalizedTiles = [...tiles]
    .sort((left, right) => left.order - right.order)
    .map((tile, index) => ({
      id: tile.id,
      label: tile.label,
      icon: tile.icon,
      order: index,
      action: cloneAction(tile.action),
      appearance: toTileAppearance("neutral")
    }));

  const selected = normalizedTiles.find((tile) => tile.id === selectedTileId) ?? normalizedTiles[0];

  return {
    tiles: normalizedTiles,
    editor: toEditorState(selected),
    isDirty,
    interaction: {
      selectedTileId: selected?.id,
      selectionValid: selected !== undefined,
      hasSelection: selected !== undefined,
      canReorder: normalizedTiles.length > 1,
      canSave: isDirty,
      editorMode: selected ? "edit" : "create"
    },
    latestFeedback,
    appearance: createDesktopControlPanelAppearance()
  };
}

function toBuilderTiles(snapshot: DashboardLayoutSnapshot): DashboardBuilderTileModel[] {
  return [...snapshot.tiles]
    .sort((left, right) => left.order - right.order)
    .map((tile, index) => ({
      id: tile.id,
      label: tile.label,
      icon: tile.icon,
      order: index,
      action: cloneAction(tile.action),
      appearance: toTileAppearance("neutral")
    }));
}

function toTileAppearance(tone: VisualSemanticTone): DesktopSurfaceAppearance {
  return createDesktopTileAppearance(tone);
}

function toCreatePayload(input: DashboardBuilderCreateTileInput): unknown {
  return {
    label: input.label,
    icon: input.icon,
    action: toActionMapping(input.actionType, {
      appId: input.appId,
      arguments: input.arguments,
      url: input.url,
      command: input.command,
      value: input.value
    })
  };
}

function toUpdatePayload(input: DashboardBuilderUpdateTileInput, existing?: DashboardTile): unknown {
  const payload: {
    label?: string;
    icon?: DashboardIconToken;
    action?: DashboardTileActionMapping;
  } = {};

  if (input.label !== undefined) {
    payload.label = input.label;
  }
  if (input.icon !== undefined) {
    payload.icon = input.icon;
  }

  if (hasActionField(input)) {
    const actionType = input.actionType ?? existing?.action.actionType ?? ACTION_TYPES[0];
    payload.action = toActionMapping(actionType, {
      appId: input.appId ?? (existing?.action.actionType === "open_app" ? existing.action.payload.appId : undefined),
      arguments:
        input.arguments ??
        (existing?.action.actionType === "open_app"
          ? existing.action.payload.arguments
          : undefined),
      url: input.url ?? (existing?.action.actionType === "open_website" ? existing.action.payload.url : undefined),
      command:
        input.command ??
        (existing?.action.actionType === "media_control"
          ? existing.action.payload.command
          : undefined),
      value:
        input.value !== undefined
          ? input.value
          : existing?.action.actionType === "media_control"
            ? existing.action.payload.value
            : undefined
    });
  }

  return payload;
}

function hasActionField(input: DashboardBuilderUpdateTileInput): boolean {
  return (
    input.actionType !== undefined ||
    input.appId !== undefined ||
    input.arguments !== undefined ||
    input.url !== undefined ||
    input.command !== undefined ||
    input.value !== undefined
  );
}

function toActionMapping(
  actionType: ActionType,
  fields: {
    appId?: string;
    arguments?: string[];
    url?: string;
    command?: MediaControlCommand;
    value?: number;
  }
): DashboardTileActionMapping {
  if (actionType === "open_app") {
    return {
      actionType,
      payload: {
        appId: fields.appId ?? "",
        ...(fields.arguments && fields.arguments.length > 0 ? { arguments: [...fields.arguments] } : {})
      }
    };
  }

  if (actionType === "open_website") {
    return {
      actionType,
      payload: {
        url: fields.url ?? ""
      }
    };
  }

  return {
    actionType,
    payload: {
      command: fields.command ?? MEDIA_CONTROL_COMMANDS[0],
      ...(fields.value === undefined ? {} : { value: fields.value })
    }
  };
}

function toEditorState(tile?: DashboardBuilderTileModel): DashboardBuilderEditorState {
  if (!tile) {
    return {
      label: "",
      icon: "apps",
      action: {
        actionType: "open_app",
        appId: "",
        arguments: [],
        url: "",
        command: MEDIA_CONTROL_COMMANDS[0],
        value: undefined
      }
    };
  }

  const action = toActionEditorState(tile.action);
  return {
    tileId: tile.id,
    label: tile.label,
    icon: tile.icon,
    action
  };
}

function toActionEditorState(action: DashboardTileActionMapping): DashboardBuilderActionEditorState {
  if (action.actionType === "open_app") {
    return {
      actionType: "open_app",
      appId: action.payload.appId,
      arguments: action.payload.arguments ? [...action.payload.arguments] : [],
      url: "",
      command: MEDIA_CONTROL_COMMANDS[0],
      value: undefined
    };
  }

  if (action.actionType === "open_website") {
    return {
      actionType: "open_website",
      appId: "",
      arguments: [],
      url: action.payload.url,
      command: MEDIA_CONTROL_COMMANDS[0],
      value: undefined
    };
  }

  return {
    actionType: "media_control",
    appId: "",
    arguments: [],
    url: "",
    command: action.payload.command,
    value: action.payload.value
  };
}

function mapMutationResult<T>(
  kind: MutationKind,
  result: DashboardMutationResult<T>,
  model: DashboardBuilderRuntimeModel,
  targetTileId?: string
): DashboardBuilderMutationResult {
  if (result.ok) {
    const statusLabel = successStatusLabel(kind);
    return {
      ok: true,
      statusLabel,
      feedback: createDashboardBuilderFeedback({
        operation: toFeedbackOperation(kind),
        outcome: "success",
        message: statusLabel,
        targetTileId
      }),
      model
    };
  }

  return mapMutationError(toFeedbackOperation(kind), result, model, targetTileId);
}

function successStatusLabel(kind: MutationKind): string {
  if (kind === "create") {
    return "Tile created";
  }
  if (kind === "update") {
    return "Tile updated";
  }
  return "Tile deleted";
}

function mapMutationError(
  operation: DashboardBuilderFeedbackOperation,
  error: DashboardMutationError,
  model: DashboardBuilderRuntimeModel,
  targetTileId?: string
): DashboardBuilderMutationResult {
  if (error.reason === "invalid_reorder") {
    return {
      ok: false,
      statusLabel: "Tile reorder is invalid",
      feedback: createDashboardBuilderFeedback({
        operation,
        outcome: "failure",
        message: "Tile reorder is invalid",
        code: "invalid_reorder",
        targetTileId
      }),
      code: "invalid_reorder",
      model
    };
  }

  if (error.reason === "not_found") {
    return {
      ok: false,
      statusLabel: "Tile not found",
      feedback: createDashboardBuilderFeedback({
        operation,
        outcome: "failure",
        message: "Tile not found",
        code: "not_found",
        targetTileId
      }),
      code: "not_found",
      model
    };
  }

  const statusLabel = toValidationStatusLabel(error);
  return {
    ok: false,
    statusLabel,
    feedback: createDashboardBuilderFeedback({
      operation,
      outcome: "failure",
      message: statusLabel,
      code: error.code,
      targetTileId
    }),
    code: error.code,
    model
  };
}

function toFeedbackOperation(kind: MutationKind): DashboardBuilderFeedbackOperation {
  return kind;
}

function toValidationStatusLabel(error: DashboardMutationError): string {
  if (error.reason !== "validation_failed" || !error.code) {
    return "Tile update is invalid";
  }

  if (error.code === "invalid_label") {
    return "Tile label is required";
  }
  if (error.code === "invalid_icon") {
    return "Tile icon is not supported";
  }
  if (error.code === "invalid_action_type") {
    return "Tile action type is not supported";
  }
  if (error.code === "invalid_action_payload") {
    return "Tile action details are invalid";
  }
  return "Provide at least one tile field to update";
}

function cloneAction(action: DashboardTileActionMapping): DashboardTileActionMapping {
  if (action.actionType === "open_app") {
    return {
      actionType: "open_app",
      payload: {
        appId: action.payload.appId,
        ...(action.payload.arguments ? { arguments: [...action.payload.arguments] } : {})
      }
    };
  }

  if (action.actionType === "open_website") {
    return {
      actionType: "open_website",
      payload: {
        url: action.payload.url
      }
    };
  }

  return {
    actionType: "media_control",
    payload: {
      command: action.payload.command,
      ...(action.payload.value === undefined ? {} : { value: action.payload.value })
    }
  };
}

function hasSameTileOrderIds(
  tiles: DashboardBuilderTileModel[],
  orderIds: readonly string[]
): boolean {
  if (tiles.length !== orderIds.length) {
    return false;
  }

  for (let index = 0; index < tiles.length; index += 1) {
    if (tiles[index].id !== orderIds[index]) {
      return false;
    }
  }

  return true;
}

function isValidMoveIndex(index: number, size: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < size;
}
