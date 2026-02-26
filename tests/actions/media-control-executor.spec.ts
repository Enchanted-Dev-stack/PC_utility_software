import type { MediaControlActionCommand } from "../../shared/src/contracts/actions/action-command";
import {
  CURATED_MEDIA_CONTROL_COMMANDS,
  createMediaControlExecutor,
  type CuratedMediaControlCommand,
  type MediaControlPlatformAdapter
} from "../../apps/desktop/src/runtime/actions/executors/media-control-executor";

describe("media control executor", () => {
  it("returns success for each curated command when adapter succeeds", async () => {
    const calls: CuratedMediaControlCommand[] = [];
    const adapter: MediaControlPlatformAdapter = {
      execute: async (requestedCommand) => {
        calls.push(requestedCommand);
        return { ok: true };
      }
    };
    const execute = createMediaControlExecutor({
      platform: "win32",
      windowsAdapter: adapter
    });

    for (const command of CURATED_MEDIA_CONTROL_COMMANDS) {
      const result = await execute(createMediaCommand(command));
      expect(result).toEqual({ outcomeCode: "success" });
    }

    expect(calls).toEqual([...CURATED_MEDIA_CONTROL_COMMANDS]);
  });

  it("returns unsupported_platform for non-windows platforms", async () => {
    const adapter: MediaControlPlatformAdapter = {
      execute: jest.fn(async () => ({ ok: true }))
    };
    const execute = createMediaControlExecutor({
      platform: "darwin",
      windowsAdapter: adapter
    });

    const result = await execute(createMediaCommand("play_pause"));
    expect(result).toEqual({ outcomeCode: "unsupported_platform", detailCode: "darwin" });
    expect(adapter.execute).not.toHaveBeenCalled();
  });

  it("maps adapter command failures to command_failed", async () => {
    const execute = createMediaControlExecutor({
      platform: "win32",
      windowsAdapter: {
        execute: async () => ({ ok: false, detailCode: "transport_error" })
      }
    });

    const result = await execute(createMediaCommand("next"));
    expect(result).toEqual({ outcomeCode: "command_failed", detailCode: "transport_error" });
  });

  it("maps thrown adapter errors to command_failed", async () => {
    const execute = createMediaControlExecutor({
      platform: "win32",
      windowsAdapter: {
        execute: async () => {
          throw new Error("boom");
        }
      }
    });

    const result = await execute(createMediaCommand("previous"));
    expect(result).toEqual({ outcomeCode: "command_failed", detailCode: "adapter_exception" });
  });

  it("rejects unknown command payloads with invalid_payload and skips adapter", async () => {
    const adapter: MediaControlPlatformAdapter = {
      execute: jest.fn(async () => ({ ok: true }))
    };
    const execute = createMediaControlExecutor({
      platform: "win32",
      windowsAdapter: adapter
    });

    const invalidCommand = createMediaCommand("next_track" as unknown as CuratedMediaControlCommand);
    const result = await execute(invalidCommand);

    expect(result).toEqual({ outcomeCode: "invalid_payload", detailCode: "invalid_media_command" });
    expect(adapter.execute).not.toHaveBeenCalled();
  });
});

function createMediaCommand(command: CuratedMediaControlCommand): MediaControlActionCommand {
  return {
    actionId: `action-${command}`,
    actionType: "media_control",
    payload: { command },
    deviceId: "device-1",
    hostId: "host-1",
    sessionId: "session-1",
    requestedAt: "2026-02-27T00:00:00.000Z"
  };
}
