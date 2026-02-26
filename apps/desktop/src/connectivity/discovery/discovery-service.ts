import {
  createDiscoveryEnvelope,
  type DiscoveryEnvelope,
  type DiscoveryHostMetadata,
  type ScanRequestPayload,
  type ScanResultPayload
} from "../../../../../shared/src/contracts/connectivity/discovery";

export interface LanDiscoveryAdapter {
  broadcastScanResult(message: DiscoveryEnvelope<ScanResultPayload>): Promise<void>;
}

export interface DiscoveryServiceConfig {
  hostId: string;
  hostName: string;
  deviceId: string;
  now?: () => string;
}

export class DiscoveryService {
  private readonly adapter: LanDiscoveryAdapter;
  private readonly config: DiscoveryServiceConfig;

  public constructor(adapter: LanDiscoveryAdapter, config: DiscoveryServiceConfig) {
    this.adapter = adapter;
    this.config = config;
  }

  public buildHostMetadata(lastSeen?: string): DiscoveryHostMetadata {
    return {
      hostId: this.config.hostId,
      hostName: this.config.hostName,
      deviceId: this.config.deviceId,
      lastSeen: lastSeen ?? this.now()
    };
  }

  public createScanResultEnvelope(lastSeen?: string): DiscoveryEnvelope<ScanResultPayload> {
    return createDiscoveryEnvelope("scan_result", {
      hosts: [this.buildHostMetadata(lastSeen)]
    }, this.now());
  }

  public async respondToScanRequest(
    _request: ScanRequestPayload,
    lastSeen?: string
  ): Promise<DiscoveryEnvelope<ScanResultPayload>> {
    const response = this.createScanResultEnvelope(lastSeen);
    await this.adapter.broadcastScanResult(response);
    return response;
  }

  private now(): string {
    return this.config.now ? this.config.now() : new Date().toISOString();
  }
}
