import type {
  DiscoveryEnvelope,
  DiscoveryHostMetadata,
  ScanResultPayload
} from "../../../../../shared/src/contracts/connectivity/discovery";
import type { LanDiscoveryAdapter } from "../../connectivity/discovery/discovery-service";
import type { ManualConnectAdapter } from "../../connectivity/discovery/manual-connect";

export interface RuntimeLanHost extends DiscoveryHostMetadata {
  ipAddress: string;
  reachable?: boolean;
}

export class InMemoryLanDiscoveryAdapter implements LanDiscoveryAdapter, ManualConnectAdapter {
  private readonly hostByIpAddress: Map<string, RuntimeLanHost>;
  private readonly hostById: Map<string, RuntimeLanHost>;
  private lastBroadcast: DiscoveryEnvelope<ScanResultPayload> | null;

  public constructor(seedHosts: RuntimeLanHost[] = []) {
    this.hostByIpAddress = new Map<string, RuntimeLanHost>();
    this.hostById = new Map<string, RuntimeLanHost>();
    this.lastBroadcast = null;

    seedHosts.forEach((host) => {
      this.registerHost(host);
    });
  }

  public registerHost(host: RuntimeLanHost): void {
    const normalized: RuntimeLanHost = {
      ...host,
      ipAddress: host.ipAddress.trim(),
      reachable: host.reachable !== false
    };

    this.hostByIpAddress.set(normalized.ipAddress, normalized);
    this.hostById.set(normalized.hostId, normalized);
  }

  public async broadcastScanResult(message: DiscoveryEnvelope<ScanResultPayload>): Promise<void> {
    this.lastBroadcast = message;
  }

  public getLastBroadcast(): DiscoveryEnvelope<ScanResultPayload> | null {
    return this.lastBroadcast;
  }

  public getKnownHosts(): DiscoveryHostMetadata[] {
    return Array.from(this.hostByIpAddress.values()).map((host) => ({
      hostId: host.hostId,
      hostName: host.hostName,
      deviceId: host.deviceId,
      lastSeen: host.lastSeen
    }));
  }

  public getHostById(hostId: string): RuntimeLanHost | null {
    return this.hostById.get(hostId) ?? null;
  }

  public async handshake(ipAddress: string): Promise<DiscoveryHostMetadata | null> {
    const host = this.hostByIpAddress.get(ipAddress.trim());
    if (!host || host.reachable === false) {
      return null;
    }

    return {
      hostId: host.hostId,
      hostName: host.hostName,
      deviceId: host.deviceId,
      lastSeen: host.lastSeen
    };
  }
}
