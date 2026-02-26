export const ACTION_TYPES = ["open_app", "open_website", "media_control"] as const;

export type ActionType = (typeof ACTION_TYPES)[number];

export const MEDIA_CONTROL_COMMANDS = [
  "play_pause",
  "next_track",
  "previous_track",
  "volume_set",
  "volume_up",
  "volume_down",
  "mute_toggle"
] as const;

export type MediaControlCommand = (typeof MEDIA_CONTROL_COMMANDS)[number];

export interface ActionCommandEnvelopeBase {
  actionId: string;
  deviceId: string;
  hostId: string;
  sessionId: string;
  requestedAt: string;
}

export interface OpenAppActionPayload {
  appId: string;
  arguments?: string[];
}

export interface OpenWebsiteActionPayload {
  url: string;
}

export interface MediaControlActionPayload {
  command: MediaControlCommand;
  value?: number;
}

export interface OpenAppActionCommand extends ActionCommandEnvelopeBase {
  actionType: "open_app";
  payload: OpenAppActionPayload;
}

export interface OpenWebsiteActionCommand extends ActionCommandEnvelopeBase {
  actionType: "open_website";
  payload: OpenWebsiteActionPayload;
}

export interface MediaControlActionCommand extends ActionCommandEnvelopeBase {
  actionType: "media_control";
  payload: MediaControlActionPayload;
}

export type ActionCommand =
  | OpenAppActionCommand
  | OpenWebsiteActionCommand
  | MediaControlActionCommand;
