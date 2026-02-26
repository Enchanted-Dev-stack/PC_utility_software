import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { OpenAppActionCommand } from "../../../../../../shared/src/contracts/actions/action-command";

type DesktopPlatform = "win32" | "darwin" | "linux";

export type OpenAppOutcomeCode = "success" | "app_not_found" | "launch_failed" | "unsupported_platform";

export interface OpenAppExecutionResult {
  outcomeCode: OpenAppOutcomeCode;
  detailCode?: string;
}

interface LaunchTarget {
  command: string;
  args: readonly string[];
}

interface AppTargetDefinition {
  targets: Partial<Record<DesktopPlatform, LaunchTarget>>;
}

export type AppSpawnFunction = (
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions
) => ChildProcess;

export interface OpenAppExecutorOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: AppSpawnFunction;
}

const APP_ALLOWLIST: Record<string, AppTargetDefinition> = {
  calculator: {
    targets: {
      win32: { command: "cmd", args: ["/c", "start", "", "calc.exe"] },
      darwin: { command: "open", args: ["-a", "Calculator"] }
    }
  },
  notepad: {
    targets: {
      win32: { command: "notepad.exe", args: [] },
      darwin: { command: "open", args: ["-a", "TextEdit"] }
    }
  }
};

export function createOpenAppExecutor(
  options: OpenAppExecutorOptions = {}
): (command: OpenAppActionCommand) => Promise<OpenAppExecutionResult> {
  return async (command) => {
    const appKey = command.payload?.appId;
    if (typeof appKey !== "string" || appKey.trim().length === 0) {
      return { outcomeCode: "app_not_found", detailCode: "missing_app_key" };
    }

    const targetDefinition = APP_ALLOWLIST[appKey];
    if (!targetDefinition) {
      return { outcomeCode: "app_not_found", detailCode: "unknown_app_key" };
    }

    const platform = options.platform ?? process.platform;
    if (!isDesktopPlatform(platform)) {
      return { outcomeCode: "unsupported_platform", detailCode: platform };
    }

    const target = targetDefinition.targets[platform];
    if (!target) {
      return { outcomeCode: "unsupported_platform", detailCode: `${appKey}:${platform}` };
    }

    return launchTarget(target, options.spawnProcess ?? spawn, "app_not_found");
  };
}

function isDesktopPlatform(platform: NodeJS.Platform): platform is DesktopPlatform {
  return platform === "win32" || platform === "darwin" || platform === "linux";
}

function launchTarget(
  target: LaunchTarget,
  spawnProcess: AppSpawnFunction,
  missingBinaryCode: "app_not_found" | "launch_failed"
): Promise<OpenAppExecutionResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: OpenAppExecutionResult): void => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(result);
    };

    const child = spawnProcess(target.command, [...target.args], {
      shell: false,
      detached: true,
      windowsHide: true,
      stdio: "ignore"
    });

    child.once("error", (error) => {
      const code = typeof (error as NodeJS.ErrnoException).code === "string"
        ? (error as NodeJS.ErrnoException).code
        : undefined;

      if (code === "ENOENT") {
        settle({ outcomeCode: missingBinaryCode, detailCode: "launcher_not_found" });
        return;
      }

      settle({ outcomeCode: "launch_failed", detailCode: code ?? "spawn_error" });
    });

    child.once("spawn", () => {
      child.unref();
      settle({ outcomeCode: "success" });
    });

    child.once("close", (exitCode) => {
      if (typeof exitCode === "number" && exitCode !== 0) {
        settle({ outcomeCode: "launch_failed", detailCode: `exit_code_${exitCode}` });
      }
    });
  });
}
