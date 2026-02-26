import { DiscoveryService, type LanDiscoveryAdapter } from "../../apps/desktop/src/connectivity/discovery/discovery-service";

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
