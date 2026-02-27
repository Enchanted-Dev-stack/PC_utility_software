import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { MobileConnectivityClient } from "../../apps/mobile/src/runtime/connectivity/mobile-connectivity-client";
import {
  createDesktopControlPanelRuntimeHandlers,
  areRowsNewestFirst,
  createDesktopControlPanelRuntimeModel,
  hasRecentActionRows,
  mergeConnectionSnapshot
} from "../../apps/desktop/src/ui/control-panel/DesktopControlPanelModel";
import { isFocusVisibilityCompliant } from "../../shared/src/contracts/ui/accessibility-standards";

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

  it("exposes dashboard builder section and runtime handlers without regressing existing sections", async () => {
    const runtime = createRuntime();
    const handlers = createDesktopControlPanelRuntimeHandlers(runtime);

    const created = await handlers.dashboardBuilder.createTile({
      label: "Browser",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com"
    });

    expect(created).toMatchObject({
      ok: true,
      statusLabel: "Tile created"
    });

    const model = await handlers.getModel();
    expect(model.dashboardBuilder.tiles).toHaveLength(1);
    expect(model.dashboardBuilder.tiles[0]).toMatchObject({
      label: "Browser",
      icon: "browser"
    });
    expect(model.dashboardBuilder.tiles[0].appearance.semanticTone).toBe("neutral");
    expect(model.dashboardBuilder.tiles[0].appearance.states.focus.focusRingVisible).toBe(true);
    expect(model.feedbackMessage).toEqual({
      id: expect.stringContaining("builder-"),
      source: "builder",
      message: "Tile created"
    });

    expect(model.connectionBanner.label).toBeDefined();
    expect(model.connectionBannerAppearance.semanticTone).toBe("error");
    expect(model.appearance.canvasEmphasis).toBe("primary");
    expect(model.trustedDevicesPanel.title).toBe("Trusted devices");
    expect(model.actionHistoryPanel.title).toBe("Recent actions");
  });

  it("applies builder feedback dedupe boundaries for equivalent outcomes", async () => {
    const runtime = createRuntime();
    const handlers = createDesktopControlPanelRuntimeHandlers(runtime);

    const initial = await handlers.getModel();
    expect(initial.feedbackMessage).toBeUndefined();

    const missingFirst = await handlers.dashboardBuilder.updateTile({
      tileId: "missing",
      label: "No change"
    });
    expect(missingFirst.ok).toBe(false);

    const firstMessage = await handlers.getModel();
    expect(firstMessage.feedbackMessage).toEqual({
      id: expect.stringContaining("builder-update|failure|not_found|missing"),
      source: "builder",
      message: "Tile not found"
    });

    const missingSecond = await handlers.dashboardBuilder.updateTile({
      tileId: "missing",
      label: "No change"
    });
    expect(missingSecond.ok).toBe(false);

    const duplicateSuppressed = await handlers.getModel();
    expect(duplicateSuppressed.feedbackMessage).toBeUndefined();
  });

  it("keeps connection toast coexistence with builder feedback channels", async () => {
    const runtime = createRuntime();
    const handlers = createDesktopControlPanelRuntimeHandlers(runtime);

    const previous = runtime.getConnectionStatus();
    runtime.setReconnecting("host-primary", 1);
    const current = runtime.getConnectionStatus();
    const reconnectingBanner = mergeConnectionSnapshot(previous, current, runtime, "Reconnecting...");
    expect(reconnectingBanner.toast?.id).toContain("desktop-status-reconnecting-reconnecting");

    const reconnectingModel = await handlers.getModel();
    expect(reconnectingModel.feedbackMessage).toEqual({
      id: reconnectingBanner.toast?.id,
      source: "connection",
      message: "Reconnecting..."
    });

    const created = await handlers.dashboardBuilder.createTile({
      label: "Browser",
      icon: "browser",
      actionType: "open_website",
      url: "https://example.com"
    });
    expect(created.ok).toBe(true);

    const builderModel = await handlers.getModel();
    expect(builderModel.feedbackMessage).toEqual({
      id: expect.stringContaining("builder-create|success"),
      source: "builder",
      message: "Tile created"
    });
  });

  it("keeps critical control-panel sections keyboard-focus compliant", async () => {
    const runtime = createRuntime();
    const model = await createDesktopControlPanelRuntimeModel(runtime);

    expect(model.dashboardBuilder.accessibility.primaryControls["layout-save"].keyboardOperable).toBe(true);

    for (const section of Object.values(model.accessibility.sections)) {
      expect(section.focusRingVisible).toBe(true);
      expect(section.contrastRatio).toBeGreaterThanOrEqual(section.minContrastRatio);
      expect(isFocusVisibilityCompliant(section)).toBe(true);
    }
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
