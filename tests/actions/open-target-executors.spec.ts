import { EventEmitter } from "node:events";
import type { ChildProcess } from "node:child_process";
import {
  createOpenAppExecutor,
  type AppSpawnFunction
} from "../../apps/desktop/src/runtime/actions/executors/open-app-executor";
import {
  createOpenWebsiteExecutor,
  type UrlSpawnFunction
} from "../../apps/desktop/src/runtime/actions/executors/open-url-executor";
import type {
  OpenAppActionCommand,
  OpenWebsiteActionCommand
} from "../../shared/src/contracts/actions/action-command";

describe("open application executor", () => {
  it("launches an allowlisted app key with non-shell argument arrays", async () => {
    const spawnProcess = createAppSpawnSuccessMock();
    const execute = createOpenAppExecutor({
      platform: "win32",
      spawnProcess
    });

    const result = await execute(createOpenAppCommand("calculator"));

    expect(result).toEqual({ outcomeCode: "success" });
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnProcess.mock.calls[0];
    expect(command).toBe("cmd");
    expect(args).toEqual(["/c", "start", "", "calc.exe"]);
    expect(Array.isArray(args)).toBe(true);
    expect(options?.shell).toBe(false);
  });

  it("rejects unknown app keys before attempting process execution", async () => {
    const spawnProcess = createAppSpawnSuccessMock();
    const execute = createOpenAppExecutor({
      platform: "win32",
      spawnProcess
    });

    const result = await execute(createOpenAppCommand("unknown-app"));

    expect(result).toEqual({ outcomeCode: "app_not_found", detailCode: "unknown_app_key" });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("maps launcher spawn errors to launch_failed", async () => {
    const spawnProcess = createAppSpawnErrorMock("EACCES");
    const execute = createOpenAppExecutor({
      platform: "win32",
      spawnProcess
    });

    const result = await execute(createOpenAppCommand("notepad"));

    expect(result).toEqual({ outcomeCode: "launch_failed", detailCode: "EACCES" });
  });

  it("returns unsupported_platform when no mapping is available", async () => {
    const spawnProcess = createAppSpawnSuccessMock();
    const execute = createOpenAppExecutor({
      platform: "freebsd",
      spawnProcess
    });

    const result = await execute(createOpenAppCommand("calculator"));

    expect(result).toEqual({ outcomeCode: "unsupported_platform", detailCode: "freebsd" });
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});

describe("open website executor", () => {
  it("validates and opens http/https URLs with non-shell argument arrays", async () => {
    const spawnProcess = createUrlSpawnSuccessMock();
    const execute = createOpenWebsiteExecutor({
      platform: "darwin",
      spawnProcess
    });

    const result = await execute(createOpenWebsiteCommand("https://example.com/path?foo=bar"));

    expect(result.outcomeCode).toBe("success");
    expect(result.normalizedUrl).toBe("https://example.com/path?foo=bar");
    expect(spawnProcess).toHaveBeenCalledTimes(1);
    const [command, args, options] = spawnProcess.mock.calls[0];
    expect(command).toBe("open");
    expect(args).toEqual(["https://example.com/path?foo=bar"]);
    expect(Array.isArray(args)).toBe(true);
    expect(options?.shell).toBe(false);
  });

  it("rejects malformed URLs as invalid_url before launch", async () => {
    const spawnProcess = createUrlSpawnSuccessMock();
    const execute = createOpenWebsiteExecutor({
      platform: "win32",
      spawnProcess
    });

    const result = await execute(createOpenWebsiteCommand("not a url"));

    expect(result).toEqual({
      outcomeCode: "invalid_url",
      detailCode: "invalid_or_unsupported_protocol"
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("rejects non-http protocols as invalid_url", async () => {
    const spawnProcess = createUrlSpawnSuccessMock();
    const execute = createOpenWebsiteExecutor({
      platform: "linux",
      spawnProcess
    });

    const result = await execute(createOpenWebsiteCommand("file:///etc/passwd"));

    expect(result).toEqual({
      outcomeCode: "invalid_url",
      detailCode: "invalid_or_unsupported_protocol"
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });

  it("maps launcher errors to launch_failed for valid URLs", async () => {
    const spawnProcess = createUrlSpawnErrorMock("ENOENT");
    const execute = createOpenWebsiteExecutor({
      platform: "linux",
      spawnProcess
    });

    const result = await execute(createOpenWebsiteCommand("https://example.com"));

    expect(result.outcomeCode).toBe("launch_failed");
    expect(result.detailCode).toBe("ENOENT");
  });

  it("returns unsupported_platform for unknown runtime platforms", async () => {
    const spawnProcess = createUrlSpawnSuccessMock();
    const execute = createOpenWebsiteExecutor({
      platform: "aix",
      spawnProcess
    });

    const result = await execute(createOpenWebsiteCommand("https://example.com"));

    expect(result).toEqual({
      outcomeCode: "unsupported_platform",
      detailCode: "aix",
      normalizedUrl: "https://example.com/"
    });
    expect(spawnProcess).not.toHaveBeenCalled();
  });
});

function createOpenAppCommand(appId: string): OpenAppActionCommand {
  return {
    actionId: "action-open-app",
    actionType: "open_app",
    payload: { appId },
    deviceId: "device-1",
    hostId: "host-1",
    sessionId: "session-1",
    requestedAt: "2026-02-27T00:00:00.000Z"
  };
}

function createOpenWebsiteCommand(url: string): OpenWebsiteActionCommand {
  return {
    actionId: "action-open-url",
    actionType: "open_website",
    payload: { url },
    deviceId: "device-1",
    hostId: "host-1",
    sessionId: "session-1",
    requestedAt: "2026-02-27T00:00:00.000Z"
  };
}

function createAppSpawnSuccessMock(): jest.MockedFunction<AppSpawnFunction> {
  return jest.fn((() => {
    const child = new FakeChildProcess() as unknown as ChildProcess;
    queueMicrotask(() => {
      child.emit("spawn");
    });
    return child;
  }) as AppSpawnFunction);
}

function createAppSpawnErrorMock(code: string): jest.MockedFunction<AppSpawnFunction> {
  return jest.fn((() => {
    const child = new FakeChildProcess() as unknown as ChildProcess;
    queueMicrotask(() => {
      const error = new Error("spawn failed") as NodeJS.ErrnoException;
      error.code = code;
      child.emit("error", error);
    });
    return child;
  }) as AppSpawnFunction);
}

function createUrlSpawnSuccessMock(): jest.MockedFunction<UrlSpawnFunction> {
  return jest.fn((() => {
    const child = new FakeChildProcess() as unknown as ChildProcess;
    queueMicrotask(() => {
      child.emit("spawn");
    });
    return child;
  }) as UrlSpawnFunction);
}

function createUrlSpawnErrorMock(code: string): jest.MockedFunction<UrlSpawnFunction> {
  return jest.fn((() => {
    const child = new FakeChildProcess() as unknown as ChildProcess;
    queueMicrotask(() => {
      const error = new Error("spawn failed") as NodeJS.ErrnoException;
      error.code = code;
      child.emit("error", error);
    });
    return child;
  }) as UrlSpawnFunction);
}

class FakeChildProcess extends EventEmitter {
  public unref(): this {
    return this;
  }
}
