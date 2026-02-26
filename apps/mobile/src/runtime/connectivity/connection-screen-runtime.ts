import type { DiscoveryHostMetadata } from "../../../../../shared/src/contracts/connectivity/discovery";
import {
  HostDiscoveryWorkflow,
  type HostDiscoveryState,
  type HostDiscoveryStorage
} from "../../connectivity/discovery/useHostDiscovery";
import { PairingFlow, type PairingFlowState } from "../../connectivity/pairing/usePairingFlow";
import {
  ReconnectFlow,
  type ConnectionStateSnapshot,
  type ReconnectFlowOptions
} from "../../connectivity/session/useReconnectFlow";
import { MobileConnectivityClient } from "./mobile-connectivity-client";

export class InMemoryHostDiscoveryStorage implements HostDiscoveryStorage {
  private lastSuccessfulHost: DiscoveryHostMetadata | null;

  public constructor(seedHost: DiscoveryHostMetadata | null = null) {
    this.lastSuccessfulHost = seedHost ? { ...seedHost } : null;
  }

  public async getLastSuccessfulHost(): Promise<DiscoveryHostMetadata | null> {
    return this.lastSuccessfulHost ? { ...this.lastSuccessfulHost } : null;
  }

  public async setLastSuccessfulHost(host: DiscoveryHostMetadata): Promise<void> {
    this.lastSuccessfulHost = { ...host };
  }
}

export interface ConnectionScreenRuntimeState {
  discovery: HostDiscoveryState;
  pairing: PairingFlowState;
  reconnect: ConnectionStateSnapshot;
}

export class ConnectionScreenRuntime {
  private readonly discoveryWorkflow: HostDiscoveryWorkflow;
  private readonly pairingFlow: PairingFlow;
  private readonly reconnectFlow: ReconnectFlow;

  public constructor(
    client: MobileConnectivityClient,
    storage: HostDiscoveryStorage,
    requesterDeviceId: string,
    reconnectFlowOptions: ReconnectFlowOptions = {}
  ) {
    this.discoveryWorkflow = new HostDiscoveryWorkflow(client, storage, requesterDeviceId);
    this.pairingFlow = new PairingFlow(client, requesterDeviceId);
    this.reconnectFlow = new ReconnectFlow(client, reconnectFlowOptions);
  }

  public getState(): ConnectionScreenRuntimeState {
    return {
      discovery: this.discoveryWorkflow.getState(),
      pairing: this.pairingFlow.getState(),
      reconnect: this.reconnectFlow.getState()
    };
  }

  public async openConnectionScreen(): Promise<ConnectionScreenRuntimeState> {
    const discovery = await this.discoveryWorkflow.openConnectionScreen();
    if (discovery.lastSuccessfulHost?.hostId) {
      this.reconnectFlow.switchHost(discovery.lastSuccessfulHost.hostId);
    }

    return {
      discovery,
      pairing: this.pairingFlow.getState(),
      reconnect: this.reconnectFlow.getState()
    };
  }

  public async submitManualIp(ipAddress: string): Promise<ConnectionScreenRuntimeState> {
    const discovery = await this.discoveryWorkflow.submitManualIp(ipAddress);
    if (discovery.lastSuccessfulHost?.hostId) {
      this.reconnectFlow.switchHost(discovery.lastSuccessfulHost.hostId);
    }

    return {
      discovery,
      pairing: this.pairingFlow.getState(),
      reconnect: this.reconnectFlow.getState()
    };
  }

  public pairingFlowController(): PairingFlow {
    return this.pairingFlow;
  }

  public reconnectFlowController(): ReconnectFlow {
    return this.reconnectFlow;
  }
}
