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
import type {
  ConnectionStateSnapshot,
  DisconnectReason
} from "../../connectivity/session/reconnect-state-machine";
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

export type RuntimeStatusReason = DisconnectReason;

export interface RuntimeConnectionStatusSnapshot extends ConnectionStateSnapshot {
  trustedConnection: boolean;
}

export interface RuntimeHeaderStatus {
  activeHostLabel: string;
  trustedIndicator: "trusted" | "untrusted";
}

export interface RuntimeStatusEvent {
  snapshot: RuntimeConnectionStatusSnapshot;
  toast?: string;
}

export type RuntimeStatusListener = (event: RuntimeStatusEvent) => void;

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
  private readonly statusListeners: Set<RuntimeStatusListener>;
  private lastSuccessfulHost: DiscoveryHostMetadata | null;
  private statusSnapshot: RuntimeConnectionStatusSnapshot;
  private activeSessionScope: { deviceId: string; hostId: string } | null;

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
    this.statusListeners = new Set<RuntimeStatusListener>();
    this.lastSuccessfulHost = null;
    this.statusSnapshot = {
      state: "disconnected",
      hostId: undefined,
      reason: "none",
      retryAttempt: 0,
      retryWindowMs: 45000,
      canSwitchHost: true,
      canManualRetry: true,
      trustedConnection: false
    };
    this.activeSessionScope = null;
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
      this.updateStatus({
        state: "disconnected",
        hostId: input.hostId,
        reason: "host_unavailable",
        retryAttempt: 0,
        retryWindowMs: this.statusSnapshot.retryWindowMs,
        canSwitchHost: true,
        canManualRetry: true,
        trustedConnection: false
      });
      return {
        connected: false,
        reason: "host_not_found"
      };
    }

    const trusted = await this.trustStore.isTrusted(input.requesterDeviceId, input.hostId);
    if (!trusted) {
      this.updateStatus({
        state: "disconnected",
        hostId: input.hostId,
        reason: "connection_failed",
        retryAttempt: 0,
        retryWindowMs: this.statusSnapshot.retryWindowMs,
        canSwitchHost: true,
        canManualRetry: true,
        trustedConnection: false
      });
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
    this.activeSessionScope = {
      deviceId: input.requesterDeviceId,
      hostId: input.hostId
    };
    this.updateStatus({
      state: "connected",
      hostId: input.hostId,
      reason: "none",
      retryAttempt: 0,
      retryWindowMs: this.statusSnapshot.retryWindowMs,
      canSwitchHost: false,
      canManualRetry: false,
      trustedConnection: true
    });
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

  public async validateSession(
    sessionId: string,
    deviceId: string,
    hostId: string
  ): Promise<boolean> {
    const activeSessionId = this.sessionsByScopedDevice.get(this.scopeKey(deviceId, hostId));
    return activeSessionId === sessionId;
  }

  public getConnectionStatus(): RuntimeConnectionStatusSnapshot {
    return { ...this.statusSnapshot };
  }

  public getHeaderStatus(): RuntimeHeaderStatus {
    const hostLabel = this.statusSnapshot.hostId ?? this.lastSuccessfulHost?.hostName ?? "No active host";
    return {
      activeHostLabel: hostLabel,
      trustedIndicator: this.statusSnapshot.trustedConnection ? "trusted" : "untrusted"
    };
  }

  public subscribeStatus(listener: RuntimeStatusListener): () => void {
    this.statusListeners.add(listener);
    listener({ snapshot: this.getConnectionStatus() });
    return () => {
      this.statusListeners.delete(listener);
    };
  }

  public setReconnecting(hostId: string, retryAttempt = 0): RuntimeConnectionStatusSnapshot {
    return this.updateStatus({
      state: "reconnecting",
      hostId,
      reason: "connection_lost",
      retryAttempt,
      retryWindowMs: this.statusSnapshot.retryWindowMs,
      canSwitchHost: true,
      canManualRetry: false,
      trustedConnection: false
    });
  }

  public async revokeTrustedDevice(input: {
    deviceId: string;
    hostId: string;
  }): Promise<{ revoked: boolean; invalidatedSessions: number }> {
    const revoked = await this.trustStore.revokeTrustedDevice(input.deviceId, input.hostId);
    if (!revoked) {
      return { revoked: false, invalidatedSessions: 0 };
    }

    const invalidatedSessions = this.invalidateSessionsForDevice(input.deviceId, input.hostId);
    if (
      this.statusSnapshot.hostId === input.hostId &&
      this.activeSessionScope?.deviceId === input.deviceId &&
      this.activeSessionScope?.hostId === input.hostId
    ) {
      this.activeSessionScope = null;
      this.updateStatus({
        state: "disconnected",
        hostId: input.hostId,
        reason: "connection_lost",
        retryAttempt: 0,
        retryWindowMs: this.statusSnapshot.retryWindowMs,
        canSwitchHost: true,
        canManualRetry: true,
        trustedConnection: false
      });
    }

    return {
      revoked: true,
      invalidatedSessions
    };
  }

  private scopeKey(deviceId: string, hostId: string): string {
    return `${hostId}::${deviceId}`;
  }

  private updateStatus(snapshot: RuntimeConnectionStatusSnapshot): RuntimeConnectionStatusSnapshot {
    const previousState = this.statusSnapshot.state;
    this.statusSnapshot = { ...snapshot };
    const toast = this.buildStatusToast(previousState, snapshot);
    this.statusListeners.forEach((listener) => {
      listener({
        snapshot: this.getConnectionStatus(),
        toast
      });
    });

    return this.getConnectionStatus();
  }

  private buildStatusToast(
    previousState: RuntimeConnectionStatusSnapshot["state"],
    snapshot: RuntimeConnectionStatusSnapshot
  ): string | undefined {
    if (snapshot.state === previousState) {
      return undefined;
    }

    if (snapshot.state === "connected") {
      const hostLabel = snapshot.hostId ?? "host";
      return `Connected to ${hostLabel}`;
    }

    if (snapshot.state === "reconnecting") {
      return "Reconnecting...";
    }

    if (snapshot.state === "disconnected") {
      return snapshot.reason === "retry_window_exhausted"
        ? "Disconnected after retry timeout"
        : "Disconnected";
    }

    return undefined;
  }

  private invalidateSessionsForDevice(deviceId: string, hostId: string): number {
    const key = this.scopeKey(deviceId, hostId);
    const hadSession = this.sessionsByScopedDevice.delete(key);
    return hadSession ? 1 : 0;
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
