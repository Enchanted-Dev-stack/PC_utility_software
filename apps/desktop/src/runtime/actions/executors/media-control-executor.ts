import type { MediaControlActionCommand } from "../../../../../../shared/src/contracts/actions/action-command";

export const CURATED_MEDIA_CONTROL_COMMANDS = [
  "play_pause",
  "next",
  "previous",
  "volume_up",
  "volume_down",
  "mute_toggle"
] as const;

export type CuratedMediaControlCommand = (typeof CURATED_MEDIA_CONTROL_COMMANDS)[number];

export type MediaControlOutcomeCode =
  | "success"
  | "command_failed"
  | "unsupported_platform"
  | "invalid_payload";

export interface MediaControlExecutionResult {
  outcomeCode: MediaControlOutcomeCode;
  detailCode?: string;
}

export interface MediaControlPlatformAdapter {
  execute(command: CuratedMediaControlCommand): Promise<{ ok: true } | { ok: false; detailCode?: string }>;
}

export interface MediaControlExecutorOptions {
  platform?: NodeJS.Platform;
  windowsAdapter?: MediaControlPlatformAdapter;
}

const WINDOWS_PLATFORM: NodeJS.Platform = "win32";

export function createMediaControlExecutor(
  options: MediaControlExecutorOptions = {}
): (command: MediaControlActionCommand) => Promise<MediaControlExecutionResult> {
  return async (command) => {
    const requestedCommand = command.payload?.command as unknown;

    if (!isCuratedMediaControlCommand(requestedCommand)) {
      return { outcomeCode: "invalid_payload", detailCode: "invalid_media_command" };
    }

    const platform = options.platform ?? process.platform;
    if (platform !== WINDOWS_PLATFORM) {
      return { outcomeCode: "unsupported_platform", detailCode: platform };
    }

    if (!options.windowsAdapter) {
      return { outcomeCode: "command_failed", detailCode: "adapter_unavailable" };
    }

    try {
      const result = await options.windowsAdapter.execute(requestedCommand);
      if (!result.ok) {
        return { outcomeCode: "command_failed", detailCode: result.detailCode ?? "adapter_failed" };
      }

      return { outcomeCode: "success" };
    } catch {
      return { outcomeCode: "command_failed", detailCode: "adapter_exception" };
    }
  };
}

function isCuratedMediaControlCommand(command: unknown): command is CuratedMediaControlCommand {
  return (
    typeof command === "string" &&
    (CURATED_MEDIA_CONTROL_COMMANDS as readonly string[]).includes(command)
  );
}
