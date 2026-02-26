import type { DiscoveryHostMetadata, ManualConnectResultPayload } from "../../../../../shared/src/contracts/connectivity/discovery";

export interface HostDiscoveryClient {
  scanHosts(): Promise<DiscoveryHostMetadata[]>;
  manualConnect(ipAddress: string, requesterDeviceId: string): Promise<ManualConnectResultPayload>;
}

export interface HostDiscoveryStorage {
  getLastSuccessfulHost(): Promise<DiscoveryHostMetadata | null>;
  setLastSuccessfulHost(host: DiscoveryHostMetadata): Promise<void>;
}

export interface HostDiscoveryState {
  status: "idle" | "scanning" | "ready" | "error";
  hosts: DiscoveryHostMetadata[];
  error?: "invalid_ip" | "unreachable_host";
  canRetryScan: boolean;
  canEnterIpManually: boolean;
  lastSuccessfulHost: DiscoveryHostMetadata | null;
}

export class HostDiscoveryWorkflow {
  private readonly client: HostDiscoveryClient;
  private readonly storage: HostDiscoveryStorage;
  private readonly requesterDeviceId: string;
  private state: HostDiscoveryState;

  public constructor(
    client: HostDiscoveryClient,
    storage: HostDiscoveryStorage,
    requesterDeviceId: string
  ) {
    this.client = client;
    this.storage = storage;
    this.requesterDeviceId = requesterDeviceId;
    this.state = {
      status: "idle",
      hosts: [],
      canRetryScan: false,
      canEnterIpManually: false,
      lastSuccessfulHost: null
    };
  }

  public getState(): HostDiscoveryState {
    return { ...this.state };
  }

  public async openConnectionScreen(): Promise<HostDiscoveryState> {
    this.state.lastSuccessfulHost = await this.storage.getLastSuccessfulHost();
    return this.scanInternal();
  }

  public async retryScan(): Promise<HostDiscoveryState> {
    return this.scanInternal();
  }

  public async submitManualIp(ipAddress: string): Promise<HostDiscoveryState> {
    const result = await this.client.manualConnect(ipAddress, this.requesterDeviceId);

    if (!result.success || !result.host) {
      this.state = {
        ...this.state,
        status: "error",
        error: result.error,
        canRetryScan: true,
        canEnterIpManually: true
      };
      return this.getState();
    }

    await this.storage.setLastSuccessfulHost(result.host);
    this.state = {
      status: "ready",
      hosts: [result.host],
      canRetryScan: true,
      canEnterIpManually: true,
      lastSuccessfulHost: result.host
    };
    return this.getState();
  }

  private async scanInternal(): Promise<HostDiscoveryState> {
    this.state = {
      ...this.state,
      status: "scanning",
      error: undefined,
      canRetryScan: false,
      canEnterIpManually: false
    };

    const hosts = await this.client.scanHosts();

    this.state = {
      ...this.state,
      status: "ready",
      hosts,
      canRetryScan: true,
      canEnterIpManually: true
    };

    return this.getState();
  }
}
