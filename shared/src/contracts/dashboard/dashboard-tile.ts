import {
  ACTION_TYPES,
  MEDIA_CONTROL_COMMANDS,
  type MediaControlActionPayload,
  type OpenAppActionPayload,
  type OpenWebsiteActionPayload
} from "../actions/action-command";

export const DASHBOARD_ICON_TOKENS = [
  "apps",
  "browser",
  "media",
  "play",
  "pause",
  "next",
  "previous",
  "volume",
  "mute",
  "power"
] as const;

export type DashboardIconToken = (typeof DASHBOARD_ICON_TOKENS)[number];

export type DashboardTileActionMapping =
  | {
      actionType: "open_app";
      payload: OpenAppActionPayload;
    }
  | {
      actionType: "open_website";
      payload: OpenWebsiteActionPayload;
    }
  | {
      actionType: "media_control";
      payload: MediaControlActionPayload;
    };

export interface DashboardTile {
  id: string;
  label: string;
  icon: DashboardIconToken;
  order: number;
  action: DashboardTileActionMapping;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardLayoutSnapshot {
  version: number;
  updatedAt: string;
  tiles: DashboardTile[];
}

export interface DashboardTileCreateInput {
  label: string;
  icon: DashboardIconToken;
  action: DashboardTileActionMapping;
}

export interface DashboardTileUpdateInput {
  label?: string;
  icon?: DashboardIconToken;
  action?: DashboardTileActionMapping;
}

export type DashboardValidationCode =
  | "invalid_label"
  | "invalid_icon"
  | "invalid_action_type"
  | "invalid_action_payload"
  | "invalid_update_payload";

export type DashboardValidationResult<T> =
  | { ok: true; value: T }
  | {
      ok: false;
      code: DashboardValidationCode;
      message: string;
    };

export function validateDashboardTileCreateInput(
  input: unknown
): DashboardValidationResult<DashboardTileCreateInput> {
  if (!isRecord(input)) {
    return invalid("invalid_update_payload", "Create payload must be an object.");
  }

  const label = normalizeLabel(input.label);
  if (!label) {
    return invalid("invalid_label", "Tile label must be a non-empty string up to 48 characters.");
  }

  const icon = parseIcon(input.icon);
  if (!icon) {
    return invalid(
      "invalid_icon",
      `Tile icon must be one of: ${DASHBOARD_ICON_TOKENS.join(", ")}.`
    );
  }

  const action = parseActionMapping(input.action);
  if (!action.ok) {
    return action;
  }

  return {
    ok: true,
    value: {
      label,
      icon,
      action: action.value
    }
  };
}

export function validateDashboardTileUpdateInput(
  input: unknown
): DashboardValidationResult<DashboardTileUpdateInput> {
  if (!isRecord(input)) {
    return invalid("invalid_update_payload", "Update payload must be an object.");
  }

  const output: DashboardTileUpdateInput = {};

  if ("label" in input) {
    const label = normalizeLabel(input.label);
    if (!label) {
      return invalid("invalid_label", "Tile label must be a non-empty string up to 48 characters.");
    }
    output.label = label;
  }

  if ("icon" in input) {
    const icon = parseIcon(input.icon);
    if (!icon) {
      return invalid(
        "invalid_icon",
        `Tile icon must be one of: ${DASHBOARD_ICON_TOKENS.join(", ")}.`
      );
    }
    output.icon = icon;
  }

  if ("action" in input) {
    const action = parseActionMapping(input.action);
    if (!action.ok) {
      return action;
    }
    output.action = action.value;
  }

  if (Object.keys(output).length === 0) {
    return invalid(
      "invalid_update_payload",
      "Update payload must provide at least one of: label, icon, action."
    );
  }

  return {
    ok: true,
    value: output
  };
}

function parseActionMapping(
  value: unknown
): DashboardValidationResult<DashboardTileActionMapping> {
  if (!isRecord(value)) {
    return invalid("invalid_action_payload", "Tile action must be an object.");
  }

  const actionTypeRaw = value.actionType;
  if (
    typeof actionTypeRaw !== "string" ||
    !ACTION_TYPES.includes(actionTypeRaw as (typeof ACTION_TYPES)[number])
  ) {
    return invalid(
      "invalid_action_type",
      `Action type must be one of: ${ACTION_TYPES.join(", ")}.`
    );
  }
  const actionType = actionTypeRaw as (typeof ACTION_TYPES)[number];

  if (!isRecord(value.payload)) {
    return invalid("invalid_action_payload", "Tile action payload must be an object.");
  }

  if (actionType === "open_app") {
    const appId = normalizeShortText(value.payload.appId, 64);
    if (!appId) {
      return invalid("invalid_action_payload", "open_app payload.appId must be a non-empty string.");
    }

    const argumentsList = value.payload.arguments;
    if (argumentsList !== undefined) {
      if (!Array.isArray(argumentsList) || argumentsList.some((entry) => typeof entry !== "string")) {
        return invalid(
          "invalid_action_payload",
          "open_app payload.arguments must be an array of strings when provided."
        );
      }
    }

    const payload: OpenAppActionPayload = {
      appId,
      ...(argumentsList ? { arguments: [...argumentsList] } : {})
    };
    return {
      ok: true,
      value: {
        actionType,
        payload
      }
    };
  }

  if (actionType === "open_website") {
    const url = normalizeShortText(value.payload.url, 2048);
    if (!url || !isSupportedUrl(url)) {
      return invalid(
        "invalid_action_payload",
        "open_website payload.url must be a valid http or https URL."
      );
    }

    return {
      ok: true,
      value: {
        actionType,
        payload: {
          url
        }
      }
    };
  }

  const commandRaw = value.payload.command;
  if (
    typeof commandRaw !== "string" ||
    !MEDIA_CONTROL_COMMANDS.includes(commandRaw as (typeof MEDIA_CONTROL_COMMANDS)[number])
  ) {
    return invalid(
      "invalid_action_payload",
      `media_control payload.command must be one of: ${MEDIA_CONTROL_COMMANDS.join(", ")}.`
    );
  }
  const command = commandRaw as (typeof MEDIA_CONTROL_COMMANDS)[number];

  const numericValue = value.payload.value;
  if (numericValue !== undefined && (typeof numericValue !== "number" || !Number.isFinite(numericValue))) {
    return invalid("invalid_action_payload", "media_control payload.value must be a finite number.");
  }

  return {
    ok: true,
    value: {
      actionType,
      payload: {
        command,
        ...(numericValue === undefined ? {} : { value: numericValue })
      }
    }
  };
}

function normalizeLabel(value: unknown): string | null {
  return normalizeShortText(value, 48);
}

function normalizeShortText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    return null;
  }

  return trimmed;
}

function parseIcon(value: unknown): DashboardIconToken | null {
  if (typeof value !== "string") {
    return null;
  }

  if (!DASHBOARD_ICON_TOKENS.includes(value as DashboardIconToken)) {
    return null;
  }

  return value as DashboardIconToken;
}

function isSupportedUrl(value: string): boolean {
  if (!URL.canParse(value)) {
    return false;
  }

  const parsed = new URL(value);
  return parsed.protocol === "http:" || parsed.protocol === "https:";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function invalid<T>(code: DashboardValidationCode, message: string): DashboardValidationResult<T> {
  return {
    ok: false,
    code,
    message
  };
}
