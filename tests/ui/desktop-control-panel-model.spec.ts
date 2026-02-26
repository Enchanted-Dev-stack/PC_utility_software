import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { MobileConnectivityClient } from "../../apps/mobile/src/runtime/connectivity/mobile-connectivity-client";
import {
  areRowsNewestFirst,
  createDesktopControlPanelRuntimeModel,
  hasRecentActionRows
} from "../../apps/desktop/src/ui/control-panel/DesktopControlPanelModel";

describe("desktop control panel runtime model", () => {
  it("includes action history panel rows sourced from runtime history", async () => {
    const runtime = createRuntime();
    const client = new MobileConnectivityClient(runtime, "phone-ui");
    await pairAndConnect(runtime, client, "phone-ui", "session-ui");

    await client.submitAction({
      actionId: "history-success",
      actionType: "open_app",
      payload: { appId: "calculator" },
      hostId: "host-primary",
      sessionId: "session-ui",
      requestedAt: "2026-02-27T01:00:00.000Z"
    });
    await client.submitAction({
      actionId: "history-failure",
      actionType: "open_website",
      payload: { url: "not-a-url" },
      hostId: "host-primary",
      sessionId: "session-ui",
      requestedAt: "2026-02-27T01:00:01.000Z"
    });

    const model = await createDesktopControlPanelRuntimeModel(runtime, {
      actionHistoryLimit: 10
    });

    expect(model.actionHistoryPanel.title).toBe("Recent actions");
    expect(model.actionHistoryPanel.rows).toHaveLength(2);
    expect(model.actionHistoryPanel.rows[0]).toMatchObject({
      actionId: "history-failure",
      outcome: "failure"
    });
    expect(model.actionHistoryPanel.rows[1]).toMatchObject({
      actionId: "history-success",
      outcome: "success"
    });
    expect(hasRecentActionRows(model)).toBe(true);
    expect(areRowsNewestFirst(model)).toBe(true);
    expect(model.actionHistoryPanel.rows[0].timestamp.length).toBeGreaterThan(0);
    expect(model.actionHistoryPanel.rows[1].timestamp.length).toBeGreaterThan(0);
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
      media_control: async () => {
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
    return `2026-02-27T01:00:00.${String(tick).padStart(3, "0")}Z`;
  };
}
