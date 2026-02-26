import { spawn, type ChildProcess, type SpawnOptions } from "node:child_process";
import type { OpenWebsiteActionCommand } from "../../../../../../shared/src/contracts/actions/action-command";

type DesktopPlatform = "win32" | "darwin" | "linux";

export type OpenWebsiteOutcomeCode = "success" | "invalid_url" | "launch_failed" | "unsupported_platform";

export interface OpenWebsiteExecutionResult {
  outcomeCode: OpenWebsiteOutcomeCode;
  detailCode?: string;
  normalizedUrl?: string;
}

interface LaunchTarget {
  command: string;
  args: readonly string[];
}

export type UrlSpawnFunction = (
  command: string,
  args: ReadonlyArray<string>,
  options: SpawnOptions
) => ChildProcess;

export interface OpenWebsiteExecutorOptions {
  platform?: NodeJS.Platform;
  spawnProcess?: UrlSpawnFunction;
}

export function createOpenWebsiteExecutor(
  options: OpenWebsiteExecutorOptions = {}
): (command: OpenWebsiteActionCommand) => Promise<OpenWebsiteExecutionResult> {
  return async (command) => {
    const normalized = normalizeHttpUrl(command.payload?.url);
    if (!normalized) {
      return {
        outcomeCode: "invalid_url",
        detailCode: "invalid_or_unsupported_protocol"
      };
    }

    const platform = options.platform ?? process.platform;
    if (!isDesktopPlatform(platform)) {
      return {
        outcomeCode: "unsupported_platform",
        detailCode: platform,
        normalizedUrl: normalized
      };
    }

    const target = buildUrlLaunchTarget(platform, normalized);
    if (!target) {
      return {
        outcomeCode: "unsupported_platform",
        detailCode: platform,
        normalizedUrl: normalized
      };
    }

    const result = await launchTarget(target, options.spawnProcess ?? spawn);
    if (result.outcomeCode === "success") {
      return {
        ...result,
        normalizedUrl: normalized
      };
    }

    return {
      ...result,
      normalizedUrl: normalized
    };
  };
}

function normalizeHttpUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const input = value.trim();
  if (input.length === 0 || !URL.canParse(input)) {
    return null;
  }

  const parsed = new URL(input);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return null;
  }

  return parsed.href;
}

function isDesktopPlatform(platform: NodeJS.Platform): platform is DesktopPlatform {
  return platform === "win32" || platform === "darwin" || platform === "linux";
}

function buildUrlLaunchTarget(platform: DesktopPlatform, normalizedUrl: string): LaunchTarget | null {
  if (platform === "win32") {
    return {
      command: "cmd",
      args: ["/c", "start", "", normalizedUrl]
    };
  }

  if (platform === "darwin") {
    return {
      command: "open",
      args: [normalizedUrl]
    };
  }

  if (platform === "linux") {
    return {
      command: "xdg-open",
      args: [normalizedUrl]
    };
  }

  return null;
}

function launchTarget(
  target: LaunchTarget,
  spawnProcess: UrlSpawnFunction
): Promise<OpenWebsiteExecutionResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: OpenWebsiteExecutionResult): void => {
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

      settle({
        outcomeCode: "launch_failed",
        detailCode: code ?? "spawn_error"
      });
    });

    child.once("spawn", () => {
      child.unref();
      settle({ outcomeCode: "success" });
    });

    child.once("close", (exitCode) => {
      if (typeof exitCode === "number" && exitCode !== 0) {
        settle({
          outcomeCode: "launch_failed",
          detailCode: `exit_code_${exitCode}`
        });
      }
    });
  });
}
