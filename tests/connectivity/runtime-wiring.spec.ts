import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { InMemoryHostDiscoveryStorage, ConnectionScreenRuntime } from "../../apps/mobile/src/runtime/connectivity/connection-screen-runtime";
import { MobileConnectivityClient } from "../../apps/mobile/src/runtime/connectivity/mobile-connectivity-client";
import { SessionAuthGuard } from "../../apps/desktop/src/connectivity/session/session-auth-guard";
import { ActionRequestRuntime } from "../../apps/desktop/src/runtime/actions/action-request-runtime";
import { buildDesktopConnectionStatusBannerModel } from "../../apps/desktop/src/ui/connection-status/DesktopConnectionStatusBanner";
import {
  createTrustedDevicesPanelRuntimeHandlers,
  foldRuntimeStatusFeed
} from "../../apps/desktop/src/ui/trusted-devices/TrustedDevicesPanel";

describe("runtime connectivity adapters", () => {
  it("wires scan hosts and manual connect through concrete runtime modules", async () => {
    const runtime = new DesktopConnectivityRuntime({
      hostId: "host-primary",
      hostName: "Office-PC",
      hostDeviceId: "desktop-1",
      hostIpAddress: "192.168.1.10",
      knownHosts: [
        {
          hostId: "host-backup",
          hostName: "Studio-PC",
          deviceId: "desktop-2",
          lastSeen: "2026-02-27T00:00:00.000Z",
          ipAddress: "192.168.1.11",
          reachable: true
        }
      ]
    });
    const client = new MobileConnectivityClient(runtime, "phone-1");

    const hosts = await client.scanHosts();
    expect(hosts.map((host) => host.hostId)).toContain("host-primary");

    const manualFail = await client.manualConnect("invalid-ip", "phone-1");
    expect(manualFail).toEqual({
      success: false,
      error: "invalid_ip"
    });

    const manualSuccess = await client.manualConnect("192.168.1.11", "phone-1");
    expect(manualSuccess.success).toBe(true);
    expect(manualSuccess.host?.hostId).toBe("host-backup");
  });

  it("wires pairing pending-approved transitions and connection screen lifecycle", async () => {
    const runtime = new DesktopConnectivityRuntime({
      hostId: "host-primary",
      hostName: "Office-PC",
      hostDeviceId: "desktop-1",
      hostIpAddress: "192.168.1.10",
      now: () => "2026-02-27T01:00:00.000Z"
    });
    const client = new MobileConnectivityClient(runtime, "phone-1");
    const storage = new InMemoryHostDiscoveryStorage({
      hostId: "host-primary",
      hostName: "Office-PC",
      deviceId: "desktop-1",
      lastSeen: "2026-02-27T00:50:00.000Z"
    });
    const screenRuntime = new ConnectionScreenRuntime(client, storage, "phone-1", {
      lastSuccessfulHostId: "host-primary"
    });

    const opened = await screenRuntime.openConnectionScreen();
    expect(opened.discovery.status).toBe("ready");
    expect(opened.discovery.lastSuccessfulHost?.hostId).toBe("host-primary");
    expect(opened.reconnect.hostId).toBe("host-primary");

    const pairingFlow = screenRuntime.pairingFlowController();
    const pending = await pairingFlow.startCodePairing("phone");
    expect(pending.status).toBe("pending");
    expect(pending.challengeId).toBeDefined();

    await runtime.approvePairing(pending.challengeId as string);
    const approved = await pairingFlow.refreshStatus();
    expect(approved.status).toBe("approved");
  });
});

describe("action guard and desktop status wiring", () => {
  it("denies untrusted and invalid session actions before dispatch", async () => {
    const runtime = new DesktopConnectivityRuntime({
      hostId: "host-primary",
      hostName: "Office-PC",
      hostDeviceId: "desktop-1",
      hostIpAddress: "192.168.1.10"
    });
    const client = new MobileConnectivityClient(runtime, "phone-1");

    const pending = await client.requestPairing({
      requesterDeviceId: "phone-1",
      mode: "code",
      initiatedBy: "phone"
    });
    await runtime.approvePairing(pending.challengeId);

    const connected = await runtime.connectToHost({
      hostId: "host-primary",
      requesterDeviceId: "phone-1",
      sessionId: "session-good"
    });
    expect(connected.connected).toBe(true);

    const guard = new SessionAuthGuard(runtime.getTrustStore(), {
      async validateSession(sessionId, deviceId, hostId) {
        return runtime.validateSession(sessionId, deviceId, hostId);
      }
    });

    const dispatched: string[] = [];
    const actionRuntime = new ActionRequestRuntime(guard, async (command) => {
      dispatched.push(command.actionId);
    });

    const valid = await actionRuntime.handleAction({
      actionId: "action-1",
      actionType: "open_app",
      sessionId: "session-good",
      deviceId: "phone-1",
      hostId: "host-primary"
    });
    expect(valid).toEqual({
      accepted: true,
      actionId: "action-1",
      status: "dispatched"
    });

    const invalidSession = await actionRuntime.handleAction({
      actionId: "action-2",
      actionType: "open_app",
      sessionId: "session-bad",
      deviceId: "phone-1",
      hostId: "host-primary"
    });
    expect(invalidSession).toEqual({
      accepted: false,
      actionId: "action-2",
      reason: "invalid_session"
    });

    const untrusted = await actionRuntime.handleAction({
      actionId: "action-3",
      actionType: "open_app",
      sessionId: "session-any",
      deviceId: "phone-2",
      hostId: "host-primary"
    });
    expect(untrusted).toEqual({
      accepted: false,
      actionId: "action-3",
      reason: "untrusted_device"
    });
    expect(dispatched).toEqual(["action-1"]);
  });

  it("keeps desktop status, header indicator, toasts, and revoke handlers synchronized", async () => {
    const runtime = new DesktopConnectivityRuntime({
      hostId: "host-primary",
      hostName: "Office-PC",
      hostDeviceId: "desktop-1",
      hostIpAddress: "192.168.1.10"
    });
    const client = new MobileConnectivityClient(runtime, "phone-1");

    const pending = await client.requestPairing({
      requesterDeviceId: "phone-1",
      mode: "code",
      initiatedBy: "phone"
    });
    await runtime.approvePairing(pending.challengeId);

    const events: Array<{
      previous: ReturnType<typeof runtime.getConnectionStatus>;
      current: ReturnType<typeof runtime.getConnectionStatus>;
      header: ReturnType<typeof runtime.getHeaderStatus>;
      toast?: string;
    }> = [];
    let previous = runtime.getConnectionStatus();
    const unsubscribe = runtime.subscribeStatus((event) => {
      events.push({
        previous,
        current: event.snapshot,
        header: runtime.getHeaderStatus(),
        toast: event.toast
      });
      previous = event.snapshot;
    });

    runtime.setReconnecting("host-primary", 1);
    const connected = await runtime.connectToHost({
      hostId: "host-primary",
      requesterDeviceId: "phone-1",
      sessionId: "session-good"
    });
    expect(connected.connected).toBe(true);

    const handlers = createTrustedDevicesPanelRuntimeHandlers(runtime);
    const beforeRevoke = await handlers.getModel();
    expect(beforeRevoke.panel.items).toHaveLength(1);
    expect(beforeRevoke.activeHostLabel).toContain("host-primary");
    expect(beforeRevoke.trustedIndicator).toBe("trusted");

    const revoke = await handlers.revoke({
      deviceId: "phone-1",
      hostId: "host-primary"
    });
    expect(revoke.success).toBe(true);

    const afterRevoke = await handlers.getModel();
    expect(afterRevoke.panel.items).toHaveLength(0);
    expect(afterRevoke.connection.state).toBe("disconnected");
    expect(afterRevoke.trustedIndicator).toBe("untrusted");

    const models = events.slice(1).map((entry) =>
      buildDesktopConnectionStatusBannerModel({
        previous: entry.previous,
        current: entry.current,
        header: entry.header,
        toastMessage: entry.toast
      })
    );

    expect(models.some((model) => model.label === "Reconnecting" && model.transition === "pulse")).toBe(true);
    expect(models.some((model) => model.label === "Connected" && model.trustedIndicatorLabel === "Trusted")).toBe(true);
    expect(models.some((model) => model.label === "Disconnected" && model.trustedIndicatorLabel === "Untrusted")).toBe(true);

    const feed = foldRuntimeStatusFeed(events.map((event) => ({ snapshot: event.current, toast: event.toast })));
    expect(feed).toEqual(expect.arrayContaining(["Reconnecting...", "Disconnected"]));

    unsubscribe();
  });
});
