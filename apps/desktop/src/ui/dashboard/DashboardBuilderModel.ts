import { ACTION_TYPES, MEDIA_CONTROL_COMMANDS, type ActionType, type MediaControlCommand } from "../../../../../shared/src/contracts/actions/action-command";
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
import { DesktopConnectivityRuntime } from "../../runtime/connectivity/desktop-connectivity-runtime";

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
}

export interface DashboardBuilderRuntimeModel {
  tiles: DashboardBuilderTileModel[];
  editor: DashboardBuilderEditorState;
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

export interface DashboardBuilderMutationResult {
  ok: boolean;
  statusLabel: string;
  model: DashboardBuilderRuntimeModel;
  code?: DashboardValidationCode | "not_found";
}

export interface DashboardBuilderRuntimeHandlers {
  getModel(selectedTileId?: string): Promise<DashboardBuilderRuntimeModel>;
  createTile(input: DashboardBuilderCreateTileInput): Promise<DashboardBuilderMutationResult>;
  updateTile(input: DashboardBuilderUpdateTileInput): Promise<DashboardBuilderMutationResult>;
  deleteTile(input: DashboardBuilderDeleteTileInput): Promise<DashboardBuilderMutationResult>;
}

export async function createDashboardBuilderRuntimeModel(
  runtime: DesktopConnectivityRuntime,
  selectedTileId?: string
): Promise<DashboardBuilderRuntimeModel> {
  return createDashboardBuilderModelFromSnapshot(runtime.getDashboardLayout(), selectedTileId);
}

export function createDashboardBuilderRuntimeHandlers(
  runtime: DesktopConnectivityRuntime
): DashboardBuilderRuntimeHandlers {
  return {
    getModel: async (selectedTileId) => createDashboardBuilderRuntimeModel(runtime, selectedTileId),
    createTile: async (input) => {
      const created = runtime.createDashboardTile(toCreatePayload(input));
      return mapMutationResult(runtime, "create", created, created.ok ? created.result.id : undefined);
    },
    updateTile: async (input) => {
      const snapshot = runtime.getDashboardLayout();
      const updated = runtime.updateDashboardTile(
        input.tileId,
        toUpdatePayload(input, snapshot.tiles.find((tile) => tile.id === input.tileId))
      );
      return mapMutationResult(runtime, "update", updated, input.tileId);
    },
    deleteTile: async (input) => {
      const deleted = runtime.deleteDashboardTile(input.tileId);
      return mapMutationResult(runtime, "delete", deleted);
    }
  };
}

export function createDashboardBuilderModelFromSnapshot(
  snapshot: DashboardLayoutSnapshot,
  selectedTileId?: string
): DashboardBuilderRuntimeModel {
  const tiles = [...snapshot.tiles]
    .sort((left, right) => left.order - right.order)
    .map((tile) => ({
      id: tile.id,
      label: tile.label,
      icon: tile.icon,
      order: tile.order,
      action: cloneAction(tile.action)
    }));

  const selected =
    tiles.find((tile) => tile.id === selectedTileId) ?? (selectedTileId ? undefined : tiles[0]);

  return {
    tiles,
    editor: toEditorState(selected)
  };
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
  runtime: DesktopConnectivityRuntime,
  kind: MutationKind,
  result: DashboardMutationResult<T>,
  selectedTileId?: string
): DashboardBuilderMutationResult {
  const model = createDashboardBuilderModelFromSnapshot(runtime.getDashboardLayout(), selectedTileId);
  if (result.ok) {
    return {
      ok: true,
      statusLabel: successStatusLabel(kind),
      model
    };
  }

  return mapMutationError(result, model);
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
  error: DashboardMutationError,
  model: DashboardBuilderRuntimeModel
): DashboardBuilderMutationResult {
  if (error.reason === "not_found") {
    return {
      ok: false,
      statusLabel: "Tile not found",
      code: "not_found",
      model
    };
  }

  return {
    ok: false,
    statusLabel: toValidationStatusLabel(error),
    code: error.code,
    model
  };
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
