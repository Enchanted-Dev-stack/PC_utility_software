import { DesktopConnectivityRuntime } from "../../apps/desktop/src/runtime/connectivity/desktop-connectivity-runtime";
import { InMemoryHostDiscoveryStorage, ConnectionScreenRuntime } from "../../apps/mobile/src/runtime/connectivity/connection-screen-runtime";
import { MobileConnectivityClient } from "../../apps/mobile/src/runtime/connectivity/mobile-connectivity-client";

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
