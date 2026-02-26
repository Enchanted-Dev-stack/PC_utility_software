import type {
  DiscoveryHostMetadata,
  ManualConnectResultPayload
} from "../../../../../shared/src/contracts/connectivity/discovery";
import {
  DiscoveryService,
  type DiscoveryServiceConfig
} from "../../connectivity/discovery/discovery-service";
import {
  ManualConnectService,
  type ManualConnectPersistence
} from "../../connectivity/discovery/manual-connect";
import {
  PairingService,
  type PairingDeniedReason,
  type PairingRequest,
  type PairingStatusEvent
} from "../../connectivity/pairing/pairing-service";
import {
  InMemoryTrustStorePersistence,
  TrustedDeviceStore,
  type TrustedDeviceRecord
} from "../../connectivity/trust/trust-store";
import {
  InMemoryLanDiscoveryAdapter,
  type RuntimeLanHost
} from "./in-memory-lan-discovery-adapter";

export type RuntimeConnectResult =
  | { connected: true; host: DiscoveryHostMetadata; sessionId: string }
  | {
      connected: false;
      reason: "host_not_found" | "untrusted_device";
    };

export interface DesktopConnectivityRuntimeConfig {
  hostId: string;
  hostName: string;
  hostDeviceId: string;
  hostIpAddress: string;
  knownHosts?: RuntimeLanHost[];
  trustedSeed?: TrustedDeviceRecord[];
  now?: () => string;
}

export class DesktopConnectivityRuntime {
  private readonly discoveryAdapter: InMemoryLanDiscoveryAdapter;
  private readonly discoveryService: DiscoveryService;
  private readonly manualConnectService: ManualConnectService;
  private readonly trustStore: TrustedDeviceStore;
  private readonly pairingService: PairingService;
  private readonly sessionsByScopedDevice: Map<string, string>;
  private lastSuccessfulHost: DiscoveryHostMetadata | null;

  public constructor(config: DesktopConnectivityRuntimeConfig) {
    const now = config.now ?? (() => new Date().toISOString());
    this.discoveryAdapter = new InMemoryLanDiscoveryAdapter([
      {
        hostId: config.hostId,
        hostName: config.hostName,
        deviceId: config.hostDeviceId,
        lastSeen: now(),
        ipAddress: config.hostIpAddress,
        reachable: true
      },
      ...(config.knownHosts ?? [])
    ]);

    this.discoveryService = new DiscoveryService(
      this.discoveryAdapter,
      this.toDiscoveryConfig(config, now)
    );

    const persistence: ManualConnectPersistence = {
      persistLastSuccessfulHost: async (host) => {
        this.lastSuccessfulHost = host;
      }
    };

    this.manualConnectService = new ManualConnectService(this.discoveryAdapter, persistence);
    this.trustStore = new TrustedDeviceStore(new InMemoryTrustStorePersistence(config.trustedSeed));
    this.pairingService = new PairingService(this.trustStore, {
      hostId: config.hostId,
      now
    });
    this.sessionsByScopedDevice = new Map<string, string>();
    this.lastSuccessfulHost = null;
  }

  public async scanHosts(requesterDeviceId: string): Promise<DiscoveryHostMetadata[]> {
    await this.discoveryService.respondToScanRequest({ requesterDeviceId });
    const broadcast = this.discoveryAdapter.getLastBroadcast();
    return broadcast?.payload.hosts ?? this.discoveryAdapter.getKnownHosts();
  }

  public async manualConnect(
    ipAddress: string,
    requesterDeviceId: string
  ): Promise<ManualConnectResultPayload> {
    const envelope = await this.manualConnectService.connect({
      ipAddress,
      requesterDeviceId
    });
    if (envelope.payload.success && envelope.payload.host) {
      this.lastSuccessfulHost = envelope.payload.host;
    }
    return envelope.payload;
  }

  public async requestPairing(request: PairingRequest): Promise<PairingStatusEvent> {
    return this.pairingService.requestPairing(request);
  }

  public async getPairingStatus(challengeId: string): Promise<PairingStatusEvent> {
    return this.pairingService.getPairingStatus(challengeId);
  }

  public async approvePairing(challengeId: string): Promise<PairingStatusEvent> {
    return this.pairingService.approvePairing(challengeId);
  }

  public denyPairing(challengeId: string, reason?: PairingDeniedReason): PairingStatusEvent {
    return this.pairingService.denyPairing(challengeId, reason);
  }

  public async connectToHost(input: {
    hostId: string;
    requesterDeviceId: string;
    sessionId?: string;
  }): Promise<RuntimeConnectResult> {
    const host = this.discoveryAdapter.getHostById(input.hostId);
    if (!host) {
      return {
        connected: false,
        reason: "host_not_found"
      };
    }

    const trusted = await this.trustStore.isTrusted(input.requesterDeviceId, input.hostId);
    if (!trusted) {
      return {
        connected: false,
        reason: "untrusted_device"
      };
    }

    this.lastSuccessfulHost = {
      hostId: host.hostId,
      hostName: host.hostName,
      deviceId: host.deviceId,
      lastSeen: host.lastSeen
    };

    const sessionId = input.sessionId ?? `session-${input.hostId}-${input.requesterDeviceId}`;
    this.sessionsByScopedDevice.set(this.scopeKey(input.requesterDeviceId, input.hostId), sessionId);
    return {
      connected: true,
      host: this.lastSuccessfulHost,
      sessionId
    };
  }

  public getLastSuccessfulHost(): DiscoveryHostMetadata | null {
    return this.lastSuccessfulHost ? { ...this.lastSuccessfulHost } : null;
  }

  public async isTrustedDevice(deviceId: string, hostId: string): Promise<boolean> {
    return this.trustStore.isTrusted(deviceId, hostId);
  }

  public getTrustStore(): TrustedDeviceStore {
    return this.trustStore;
  }

  public getActiveSessionId(deviceId: string, hostId: string): string | null {
    return this.sessionsByScopedDevice.get(this.scopeKey(deviceId, hostId)) ?? null;
  }

  private scopeKey(deviceId: string, hostId: string): string {
    return `${hostId}::${deviceId}`;
  }

  private toDiscoveryConfig(
    config: DesktopConnectivityRuntimeConfig,
    now: () => string
  ): DiscoveryServiceConfig {
    return {
      hostId: config.hostId,
      hostName: config.hostName,
      deviceId: config.hostDeviceId,
      now
    };
  }
}
