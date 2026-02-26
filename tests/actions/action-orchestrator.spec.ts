import {
  ACTION_TYPES,
  MEDIA_CONTROL_COMMANDS,
  type ActionCommand,
  type ActionType
} from "../../shared/src/contracts/actions/action-command";
import type { ActionFeedbackEvent } from "../../shared/src/contracts/actions/action-feedback";
import { ActionRuntimeOrchestrator } from "../../apps/desktop/src/runtime/actions/action-orchestrator";
import { ActionFeedbackEvents } from "../../apps/desktop/src/runtime/actions/action-feedback-events";
import { ActionHistoryStore } from "../../apps/desktop/src/runtime/actions/action-history-store";
import { InMemoryTrustStorePersistence, TrustedDeviceStore } from "../../apps/desktop/src/connectivity/trust/trust-store";
import { SessionAuthGuard } from "../../apps/desktop/src/connectivity/session/session-auth-guard";

describe("action contract coverage", () => {
  it("includes curated v1 action command variants", () => {
    expect(ACTION_TYPES).toEqual(["open_app", "open_website", "media_control"]);
    expect(MEDIA_CONTROL_COMMANDS).toEqual([
      "play_pause",
      "next_track",
      "previous_track",
      "volume_set",
      "volume_up",
      "volume_down",
      "mute_toggle"
    ]);
  });

  it("keeps action envelope identifiers aligned with session auth guard fields", () => {
    const command: ActionCommand = {
      actionId: "act-1",
      actionType: "open_website",
      payload: { url: "https://example.com" },
      deviceId: "device-1",
      hostId: "host-1",
      sessionId: "session-1",
      requestedAt: "2026-02-27T00:00:00.000Z"
    };

    expect(command.deviceId).toBeDefined();
    expect(command.hostId).toBeDefined();
    expect(command.sessionId).toBeDefined();
    expect(command.actionId).toBeDefined();
    expect(command.requestedAt).toBeDefined();
  });

  it("supports all required lifecycle feedback stages without any", () => {
    const received: ActionFeedbackEvent = {
      actionId: "act-1",
      actionType: "open_app",
      deviceId: "device-1",
      hostId: "host-1",
      sessionId: "session-1",
      requestedAt: "2026-02-27T00:00:00.000Z",
      emittedAt: "2026-02-27T00:00:00.010Z",
      stage: "received"
    };

    const running: ActionFeedbackEvent = {
      ...received,
      stage: "running",
      emittedAt: "2026-02-27T00:00:00.020Z"
    };

    const success: ActionFeedbackEvent = {
      ...received,
      stage: "success",
      outcome: "success",
      outcomeCode: "executed",
      completedAt: "2026-02-27T00:00:00.030Z"
    };

    const failure: ActionFeedbackEvent = {
      ...received,
      stage: "failure",
      outcome: "failure",
      outcomeCode: "execution_failed",
      completedAt: "2026-02-27T00:00:00.030Z",
      error: {
        category: "executor",
        detailCode: "launcher_failed",
        message: "Unable to launch"
      }
    };

    expect(received.stage).toBe("received");
    expect(running.stage).toBe("running");
    expect(success.stage).toBe("success");
    expect(failure.stage).toBe("failure");
  });
});

describe("action orchestrator lifecycle", () => {
  it("emits ordered success lifecycle and appends a matching history row", async () => {
    const runtime = await createRuntime();

    const result = await runtime.orchestrator.handleAction(
      createCommand("act-success", "open_app", {
        appId: "spotify"
      })
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("Expected accepted action");
    }

    expect(result.deduplicated).toBe(false);
    expect(result.terminal.stage).toBe("success");

    expect(runtime.events.map((event) => event.stage)).toEqual(["received", "running", "success"]);

    const rows = runtime.history.list();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actionId: "act-success",
      actionType: "open_app",
      outcome: "success",
      outcomeCode: result.terminal.outcomeCode,
      completedAt: result.terminal.completedAt
    });
  });

  it("emits terminal failure and writes matching history when executor throws", async () => {
    const runtime = await createRuntime({
      failActionIds: new Set(["act-fail"])
    });

    const result = await runtime.orchestrator.handleAction(
      createCommand("act-fail", "open_website", {
        url: "https://example.com"
      })
    );

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("Expected accepted action");
    }

    expect(result.terminal.stage).toBe("failure");
    if (result.terminal.stage !== "failure") {
      throw new Error("Expected failure terminal event");
    }

    expect(result.terminal.outcomeCode).toBe("execution_failed");
    expect(result.terminal.error?.category).toBe("executor");
    expect(runtime.events.map((event) => event.stage)).toEqual(["received", "running", "failure"]);

    const historyRow = runtime.history.getByActionId("act-fail");
    expect(historyRow).not.toBeNull();
    expect(historyRow).toMatchObject({
      actionId: "act-fail",
      outcome: "failure",
      outcomeCode: "execution_failed"
    });
  });

  it("short-circuits unauthorized action without running stage or history append", async () => {
    const runtime = await createRuntime({
      trusted: false
    });

    const result = await runtime.orchestrator.handleAction(
      createCommand("act-denied", "media_control", {
        command: "play_pause"
      })
    );

    expect(result).toEqual({
      accepted: false,
      actionId: "act-denied",
      reason: "untrusted_device"
    });
    expect(runtime.events).toHaveLength(0);
    expect(runtime.history.list()).toHaveLength(0);
  });

  it("deduplicates actionId and returns deterministic terminal result without re-execution", async () => {
    const runtime = await createRuntime();

    const first = await runtime.orchestrator.handleAction(
      createCommand("act-dup", "open_website", {
        url: "https://example.com"
      })
    );
    const second = await runtime.orchestrator.handleAction(
      createCommand("act-dup", "open_website", {
        url: "https://example.com"
      })
    );

    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(true);
    if (!first.accepted || !second.accepted) {
      throw new Error("Expected accepted duplicate requests");
    }

    expect(second.deduplicated).toBe(true);
    expect(second.terminal).toEqual(first.terminal);
    expect(runtime.executionCounts.open_website).toBe(1);
    expect(runtime.events.map((event) => event.stage)).toEqual(["received", "running", "success"]);
    expect(runtime.history.list()).toHaveLength(1);
  });

  it("trims history to bounded retention while preserving append order", async () => {
    const runtime = await createRuntime({
      maxHistoryEntries: 2
    });

    await runtime.orchestrator.handleAction(createCommand("act-1", "open_app", { appId: "one" }));
    await runtime.orchestrator.handleAction(createCommand("act-2", "open_app", { appId: "two" }));
    await runtime.orchestrator.handleAction(createCommand("act-3", "open_app", { appId: "three" }));

    const rows = runtime.history.list();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.actionId)).toEqual(["act-2", "act-3"]);
    expect(rows.every((row) => row.completedAt >= row.requestedAt)).toBe(true);
  });
});

interface RuntimeOptions {
  trusted?: boolean;
  failActionIds?: Set<string>;
  maxHistoryEntries?: number;
}

async function createRuntime(options: RuntimeOptions = {}) {
  const timestamps = createTimestampGenerator();
  const trustStore = new TrustedDeviceStore(new InMemoryTrustStorePersistence());

  if (options.trusted !== false) {
    await trustStore.enrollTrustedDevice({
      deviceId: "device-1",
      hostId: "host-1",
      pairedAt: timestamps.now()
    });
  }

  const guard = new SessionAuthGuard(trustStore, {
    async validateSession() {
      return true;
    }
  });

  const feedback = new ActionFeedbackEvents();
  const history = new ActionHistoryStore(options.maxHistoryEntries ?? 100);
  const events: ActionFeedbackEvent[] = [];
  feedback.subscribe((event) => {
    events.push(event);
  });

  const executionCounts = {
    open_app: 0,
    open_website: 0,
    media_control: 0
  };

  const failActionIds = options.failActionIds ?? new Set<string>();
  const orchestrator = new ActionRuntimeOrchestrator({
    guard,
    feedback,
    history,
    now: timestamps.now,
    executors: {
      open_app: async (command) => {
        executionCounts.open_app += 1;
        throwIfNeeded(command.actionId, failActionIds);
        return { outcomeCode: "executed" };
      },
      open_website: async (command) => {
        executionCounts.open_website += 1;
        throwIfNeeded(command.actionId, failActionIds);
        return { outcomeCode: "executed" };
      },
      media_control: async (command) => {
        executionCounts.media_control += 1;
        throwIfNeeded(command.actionId, failActionIds);
        return { outcomeCode: "executed" };
      }
    }
  });

  return {
    orchestrator,
    events,
    history,
    executionCounts
  };
}

function createCommand(actionId: string, actionType: ActionType, payload: Record<string, unknown>): ActionCommand {
  const base = {
    actionId,
    deviceId: "device-1",
    hostId: "host-1",
    sessionId: "session-1",
    requestedAt: "2026-02-27T00:00:00.000Z"
  };

  if (actionType === "open_app") {
    return {
      ...base,
      actionType,
      payload: {
        appId: String(payload.appId ?? "unknown-app"),
        arguments: Array.isArray(payload.arguments)
          ? payload.arguments.map((value) => String(value))
          : undefined
      }
    };
  }

  if (actionType === "open_website") {
    return {
      ...base,
      actionType,
      payload: {
        url: String(payload.url ?? "https://example.com")
      }
    };
  }

  return {
    ...base,
    actionType,
    payload: {
      command:
        payload.command === "play_pause" ||
        payload.command === "next_track" ||
        payload.command === "previous_track" ||
        payload.command === "volume_set" ||
        payload.command === "volume_up" ||
        payload.command === "volume_down" ||
        payload.command === "mute_toggle"
          ? payload.command
          : "play_pause",
      value: typeof payload.value === "number" ? payload.value : undefined
    }
  };
}

function createTimestampGenerator() {
  let tick = 0;
  return {
    now: () => {
      tick += 1;
      return `2026-02-27T00:00:00.${String(tick).padStart(3, "0")}Z`;
    }
  };
}

function throwIfNeeded(actionId: string, failActionIds: Set<string>): void {
  if (failActionIds.has(actionId)) {
    throw new Error(`executor failed for ${actionId}`);
  }
}
