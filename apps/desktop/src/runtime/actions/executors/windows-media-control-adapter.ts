import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type {
  CuratedMediaControlCommand,
  MediaControlPlatformAdapter
} from "./media-control-executor";

interface WindowsMediaCommandTarget {
  command: string;
  args: readonly string[];
}

export type WindowsMediaSpawnFunction = (
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions
) => ChildProcess;

const WINDOWS_MEDIA_COMMAND_TARGETS: Record<CuratedMediaControlCommand, WindowsMediaCommandTarget> = {
  play_pause: createPowerShellSendKeysTarget("{MEDIA_PLAY_PAUSE}"),
  next: createPowerShellSendKeysTarget("{MEDIA_NEXT_TRACK}"),
  previous: createPowerShellSendKeysTarget("{MEDIA_PREV_TRACK}"),
  volume_up: createPowerShellSendKeysTarget("{VOLUME_UP}"),
  volume_down: createPowerShellSendKeysTarget("{VOLUME_DOWN}"),
  mute_toggle: createPowerShellSendKeysTarget("{VOLUME_MUTE}")
};

export function createWindowsMediaControlAdapter(options?: {
  spawnProcess?: WindowsMediaSpawnFunction;
}): MediaControlPlatformAdapter {
  const spawnProcess = options?.spawnProcess ?? spawn;

  return {
    execute: async (command) => {
      const target = WINDOWS_MEDIA_COMMAND_TARGETS[command];
      return executeTarget(target, spawnProcess);
    }
  };
}

function executeTarget(
  target: WindowsMediaCommandTarget,
  spawnProcess: WindowsMediaSpawnFunction
): Promise<{ ok: true } | { ok: false; detailCode?: string }> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: { ok: true } | { ok: false; detailCode?: string }): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    const child = spawnProcess(target.command, [...target.args], {
      shell: false,
      windowsHide: true,
      stdio: "ignore"
    });

    child.once("error", (error) => {
      const code = typeof (error as NodeJS.ErrnoException).code === "string"
        ? (error as NodeJS.ErrnoException).code
        : undefined;
      settle({ ok: false, detailCode: code ?? "spawn_error" });
    });

    child.once("close", (exitCode) => {
      if (exitCode === 0 || exitCode === null) {
        settle({ ok: true });
        return;
      }

      settle({ ok: false, detailCode: `exit_code_${exitCode}` });
    });
  });
}

function createPowerShellSendKeysTarget(keyToken: string): WindowsMediaCommandTarget {
  return {
    command: "powershell.exe",
    args: [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `$wshell = New-Object -ComObject WScript.Shell; $wshell.SendKeys('${keyToken}')`
    ]
  };
}
