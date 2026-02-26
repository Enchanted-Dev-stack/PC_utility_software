import { DiscoveryService, type LanDiscoveryAdapter } from "../../apps/desktop/src/connectivity/discovery/discovery-service";
import { ManualConnectService } from "../../apps/desktop/src/connectivity/discovery/manual-connect";
import { HostDiscoveryWorkflow, type HostDiscoveryClient, type HostDiscoveryStorage } from "../../apps/mobile/src/connectivity/discovery/useHostDiscovery";

describe("discovery contract and service", () => {
  it("emits scan result payload with required host metadata", async () => {
    const sentMessages: unknown[] = [];
    const adapter: LanDiscoveryAdapter = {
      async broadcastScanResult(message) {
        sentMessages.push(message);
      }
    };

    const service = new DiscoveryService(adapter, {
      hostId: "host-123",
      hostName: "Office-PC",
      deviceId: "desktop-abc",
      now: () => "2026-02-27T00:00:00.000Z"
    });

    const response = await service.respondToScanRequest({
      requesterDeviceId: "phone-xyz"
    });

    expect(sentMessages).toHaveLength(1);
    expect(response.type).toBe("scan_result");
    expect(response.payload.hosts).toHaveLength(1);
    expect(response.payload.hosts[0]).toEqual({
      hostId: "host-123",
      hostName: "Office-PC",
      deviceId: "desktop-abc",
      lastSeen: "2026-02-27T00:00:00.000Z"
    });
  });
});

describe("manual IP fallback", () => {
  it("fails explicitly on invalid IP", async () => {
    const service = new ManualConnectService(
      {
        async handshake() {
          return null;
        }
      },
      {
        async persistLastSuccessfulHost() {
          return;
        }
      }
    );

    const response = await service.connect({
      ipAddress: "not-an-ip",
      requesterDeviceId: "phone-xyz"
    });

    expect(response.payload.success).toBe(false);
    expect(response.payload.error).toBe("invalid_ip");
  });

  it("persists host metadata when manual connect succeeds", async () => {
    const persistedHosts: string[] = [];
    const service = new ManualConnectService(
      {
        async handshake() {
          return {
            hostId: "host-123",
            hostName: "Office-PC",
            deviceId: "desktop-abc",
            lastSeen: "2026-02-27T00:00:00.000Z"
          };
        }
      },
      {
        async persistLastSuccessfulHost(host) {
          persistedHosts.push(host.hostId);
        }
      }
    );

    const response = await service.connect({
      ipAddress: "192.168.1.10",
      requesterDeviceId: "phone-xyz"
    });

    expect(response.payload.success).toBe(true);
    expect(response.payload.host?.hostId).toBe("host-123");
    expect(persistedHosts).toEqual(["host-123"]);
  });
});

describe("mobile discovery workflow", () => {
  const host = {
    hostId: "host-123",
    hostName: "Office-PC",
    deviceId: "desktop-abc",
    lastSeen: "2026-02-27T00:00:00.000Z"
  };

  it("starts auto-scan on open and exposes retry/manual actions when no hosts found", async () => {
    let scanCount = 0;
    const client: HostDiscoveryClient = {
      async scanHosts() {
        scanCount += 1;
        return [];
      },
      async manualConnect() {
        return { success: false, error: "unreachable_host" };
      }
    };
    const storage: HostDiscoveryStorage = {
      async getLastSuccessfulHost() {
        return null;
      },
      async setLastSuccessfulHost() {
        return;
      }
    };

    const workflow = new HostDiscoveryWorkflow(client, storage, "phone-xyz");
    const state = await workflow.openConnectionScreen();

    expect(scanCount).toBe(1);
    expect(state.hosts).toEqual([]);
    expect(state.canRetryScan).toBe(true);
    expect(state.canEnterIpManually).toBe(true);
  });

  it("persists last successful host after manual connect", async () => {
    let persistedHostId: string | null = null;
    const client: HostDiscoveryClient = {
      async scanHosts() {
        return [];
      },
      async manualConnect() {
        return {
          success: true,
          host
        };
      }
    };
    const storage: HostDiscoveryStorage = {
      async getLastSuccessfulHost() {
        return null;
      },
      async setLastSuccessfulHost(savedHost) {
        persistedHostId = savedHost.hostId;
      }
    };

    const workflow = new HostDiscoveryWorkflow(client, storage, "phone-xyz");
    await workflow.openConnectionScreen();
    const state = await workflow.submitManualIp("192.168.1.10");

    expect(state.status).toBe("ready");
    expect(state.lastSuccessfulHost?.hostId).toBe("host-123");
    expect(persistedHostId).toBe("host-123");
  });
});
