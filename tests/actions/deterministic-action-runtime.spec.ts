import type { ActionFeedbackEvent } from "../../shared/src/contracts/actions/action-feedback";
import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { MobileConnectivityClient } from "../../apps/mobile/src/runtime/connectivity/mobile-connectivity-client";
import { createActionHistoryPanelRuntimeModel } from "../../apps/desktop/src/ui/actions/ActionHistoryPanel";

describe("guarded request runtime", () => {
  it("keeps SessionAuthGuard-first denials before orchestrator execution", async () => {
    const runtime = createRuntime();
    const trustedClient = new MobileConnectivityClient(runtime, "phone-trusted");

    await pairAndConnect(runtime, trustedClient, "phone-trusted", "session-good");

    const deniedInvalidSession = await trustedClient.submitAction({
      actionId: "action-invalid-session",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-bad",
      requestedAt: "2026-02-27T00:00:00.100Z"
    });
    expect(deniedInvalidSession).toEqual({
      accepted: false,
      actionId: "action-invalid-session",
      reason: "invalid_session"
    });

    const untrustedClient = new MobileConnectivityClient(runtime, "phone-untrusted");
    const deniedUntrusted = await untrustedClient.submitAction({
      actionId: "action-untrusted",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-any",
      requestedAt: "2026-02-27T00:00:00.200Z"
    });
    expect(deniedUntrusted).toEqual({
      accepted: false,
      actionId: "action-untrusted",
      reason: "untrusted_device"
    });
  });

  it("routes accepted actions through orchestrator lifecycle and terminal status", async () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");
    await pairAndConnect(runtime, client, "phone-1", "session-live");

    const stages: ActionFeedbackEvent["stage"][] = [];
    const stop = client.subscribeActionFeedback((event) => {
      stages.push(event.stage);
    }, "action-accepted");

    const result = await client.submitAction({
      actionId: "action-accepted",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.300Z"
    });
    stop();

    expect(result.accepted).toBe(true);
    if (!result.accepted) {
      throw new Error("Expected accepted action");
    }

    expect(result.status).toBe("completed");
    expect(result.terminal?.stage).toBe("success");
    expect(stages).toEqual(["received", "running", "success"]);
  });
});

describe("feedback and history models", () => {
  it("streams lifecycle updates by actionId to mobile subscribers", async () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");
    await pairAndConnect(runtime, client, "phone-1", "session-live");

    const observed: ActionFeedbackEvent[] = [];
    const stop = client.subscribeActionFeedback((event) => {
      observed.push(event);
    }, "action-streamed");

    await client.submitAction({
      actionId: "action-streamed",
      actionType: "open_website",
      payload: { url: "https://example.com" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.400Z"
    });
    stop();

    expect(observed.map((event) => event.stage)).toEqual(["received", "running", "success"]);
  });

  it("builds desktop history rows from runtime terminal events", async () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");
    await pairAndConnect(runtime, client, "phone-1", "session-live");

    await client.submitAction({
      actionId: "action-history-success",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.500Z"
    });
    await client.submitAction({
      actionId: "action-history-failure",
      actionType: "open_website",
      payload: { url: "notaurl" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.600Z"
    });

    const panel = createActionHistoryPanelRuntimeModel(runtime, 10);
    expect(panel.rows).toHaveLength(2);
    expect(panel.rows[0]).toMatchObject({
      actionId: "action-history-failure",
      actionLabel: "Open website",
      outcome: "failure",
      tone: "critical"
    });
    expect(panel.rows[1]).toMatchObject({
      actionId: "action-history-success",
      actionLabel: "Open app",
      outcome: "success",
      tone: "positive"
    });
  });
});

describe("deterministic action runtime", () => {
  it("covers app, website, and media terminal outcomes with one history row per accepted action", async () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-1");
    await pairAndConnect(runtime, client, "phone-1", "session-live");

    const appResult = await client.submitAction({
      actionId: "action-app",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.700Z"
    });
    const websiteResult = await client.submitAction({
      actionId: "action-website-invalid",
      actionType: "open_website",
      payload: { url: "notaurl" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.800Z"
    });
    const mediaResult = await client.submitAction({
      actionId: "action-media-fail",
      actionType: "media_control",
      payload: { command: "next" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:00.900Z"
    });

    expect(appResult.accepted).toBe(true);
    expect(websiteResult.accepted).toBe(true);
    expect(mediaResult.accepted).toBe(true);
    if (!appResult.accepted || !websiteResult.accepted || !mediaResult.accepted) {
      throw new Error("Expected accepted runtime actions");
    }

    expect(appResult.terminal?.stage).toBe("success");
    expect(websiteResult.terminal?.stage).toBe("failure");
    expect(websiteResult.terminal?.outcomeCode).toBe("validation_failed");
    expect(mediaResult.terminal?.stage).toBe("failure");
    expect(mediaResult.terminal?.outcomeCode).toBe("execution_failed");

    const history = runtime.getRecentActionHistory(10);
    expect(history.map((entry) => entry.actionId)).toEqual([
      "action-media-fail",
      "action-website-invalid",
      "action-app"
    ]);
    expect(history).toHaveLength(3);
  });

  it("creates no feedback or history rows for unauthorized requests", async () => {
    const runtime = createRuntime();
    const trustedClient = new MobileConnectivityClient(runtime, "phone-1");
    await pairAndConnect(runtime, trustedClient, "phone-1", "session-live");

    const foreignClient = new MobileConnectivityClient(runtime, "phone-2");
    const events: ActionFeedbackEvent[] = [];
    const stop = foreignClient.subscribeActionFeedback((event) => {
      events.push(event);
    });

    const denied = await foreignClient.submitAction({
      actionId: "action-denied",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-live",
      requestedAt: "2026-02-27T00:00:01.000Z"
    });
    stop();

    expect(denied).toEqual({
      accepted: false,
      actionId: "action-denied",
      reason: "untrusted_device"
    });
    expect(events).toHaveLength(0);
    expect(runtime.getRecentActionHistory(10)).toEqual([]);
  });
});

function createRuntime(): DesktopConnectivityRuntime {
  return new DesktopConnectivityRuntime({
    hostId: "host-primary",
    hostName: "Office-PC",
    hostDeviceId: "desktop-1",
    hostIpAddress: "192.168.1.10",
    actionNow: createTimestampGenerator(),
    actionExecutors: {
      open_app: async (command) => {
        if (command.payload.appId === "calculator") {
          return { outcomeCode: "success" };
        }

        return { outcomeCode: "app_not_found", detailCode: "unknown_app_key" };
      },
      open_website: async (command) => {
        if (command.payload.url.startsWith("http://") || command.payload.url.startsWith("https://")) {
          return { outcomeCode: "success" };
        }

        return { outcomeCode: "invalid_url", detailCode: "invalid_or_unsupported_protocol" };
      },
      media_control: async (command) => {
        if (command.payload.command === "next") {
          return { outcomeCode: "command_failed", detailCode: "adapter_failed" };
        }

        return { outcomeCode: "success" };
      }
    }
  });
}

async function pairAndConnect(
  runtime: DesktopConnectivityRuntime,
  client: MobileConnectivityClient,
  requesterDeviceId: string,
  sessionId: string
): Promise<void> {
  const pending = await client.requestPairing({
    requesterDeviceId,
    mode: "code",
    initiatedBy: "phone"
  });
  await runtime.approvePairing(pending.challengeId);
  const connected = await runtime.connectToHost({
    hostId: "host-primary",
    requesterDeviceId,
    sessionId
  });
  expect(connected.connected).toBe(true);
}

function createTimestampGenerator(): () => string {
  let tick = 0;
  return () => {
    tick += 1;
    return `2026-02-27T00:00:02.${String(tick).padStart(3, "0")}Z`;
  };
}
