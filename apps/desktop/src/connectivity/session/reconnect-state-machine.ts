export type ConnectionLifecycleState = "connected" | "reconnecting" | "disconnected";

export type DisconnectReason =
  | "none"
  | "connection_lost"
  | "connection_failed"
  | "host_unavailable"
  | "retry_window_exhausted";

export interface ConnectionStateSnapshot {
  state: ConnectionLifecycleState;
  hostId?: string;
  reason: DisconnectReason;
  retryAttempt: number;
  retryWindowMs: number;
  canSwitchHost: boolean;
  canManualRetry: boolean;
}

export interface ReconnectStateMachineOptions {
  retryBackoffMs?: number[];
  retryWindowMs?: number;
  lastSuccessfulHostId?: string;
  now?: () => number;
}

const DEFAULT_RETRY_BACKOFF_MS = [5000, 10000, 15000, 20000];
const DEFAULT_RETRY_WINDOW_MS = 45000;

export class ReconnectStateMachine {
  private readonly now: () => number;
  private readonly retryBackoffMs: number[];
  private readonly retryWindowMs: number;

  private state: ConnectionStateSnapshot;
  private reconnectStartedAt: number | null;
  private targetHostId: string | undefined;
  private lastSuccessfulHostId: string | undefined;

  public constructor(options: ReconnectStateMachineOptions = {}) {
    this.now = options.now ?? (() => Date.now());
    this.retryBackoffMs = options.retryBackoffMs?.length
      ? [...options.retryBackoffMs]
      : [...DEFAULT_RETRY_BACKOFF_MS];
    this.retryWindowMs = options.retryWindowMs ?? DEFAULT_RETRY_WINDOW_MS;
    this.lastSuccessfulHostId = options.lastSuccessfulHostId;
    this.targetHostId = options.lastSuccessfulHostId;
    this.reconnectStartedAt = null;
    this.state = {
      state: "disconnected",
      hostId: options.lastSuccessfulHostId,
      reason: "none",
      retryAttempt: 0,
      retryWindowMs: this.retryWindowMs,
      canSwitchHost: false,
      canManualRetry: true
    };
  }

  public getSnapshot(): ConnectionStateSnapshot {
    return { ...this.state };
  }

  public getTargetHostId(): string | undefined {
    return this.targetHostId;
  }

  public markConnected(hostId: string): ConnectionStateSnapshot {
    this.lastSuccessfulHostId = hostId;
    this.targetHostId = hostId;
    this.reconnectStartedAt = null;
    this.state = {
      state: "connected",
      hostId,
      reason: "none",
      retryAttempt: 0,
      retryWindowMs: this.retryWindowMs,
      canSwitchHost: false,
      canManualRetry: false
    };

    return this.getSnapshot();
  }

  public startReconnect(reason: DisconnectReason = "connection_lost"): ConnectionStateSnapshot {
    const reconnectHost = this.targetHostId ?? this.lastSuccessfulHostId;

    if (!reconnectHost) {
      this.state = {
        state: "disconnected",
        hostId: undefined,
        reason: "host_unavailable",
        retryAttempt: 0,
        retryWindowMs: this.retryWindowMs,
        canSwitchHost: true,
        canManualRetry: true
      };
      return this.getSnapshot();
    }

    this.targetHostId = reconnectHost;
    this.reconnectStartedAt = this.now();
    this.state = {
      state: "reconnecting",
      hostId: reconnectHost,
      reason,
      retryAttempt: 0,
      retryWindowMs: this.retryWindowMs,
      canSwitchHost: true,
      canManualRetry: false
    };

    return this.getSnapshot();
  }

  public switchHost(hostId: string): ConnectionStateSnapshot {
    this.targetHostId = hostId;
    if (this.state.state === "reconnecting") {
      this.state = {
        ...this.state,
        hostId,
        canSwitchHost: true
      };
    }
    return this.getSnapshot();
  }

  public registerRetryFailure(reason: DisconnectReason = "connection_failed"): ConnectionStateSnapshot {
    if (this.state.state !== "reconnecting") {
      return this.getSnapshot();
    }

    const nextAttempt = this.state.retryAttempt + 1;
    const exhausted = this.isRetryWindowExhausted();
    if (exhausted) {
      this.state = {
        state: "disconnected",
        hostId: this.targetHostId,
        reason: "retry_window_exhausted",
        retryAttempt: nextAttempt,
        retryWindowMs: this.retryWindowMs,
        canSwitchHost: true,
        canManualRetry: true
      };
      this.reconnectStartedAt = null;
      return this.getSnapshot();
    }

    this.state = {
      ...this.state,
      reason,
      retryAttempt: nextAttempt,
      canSwitchHost: true,
      canManualRetry: false
    };
    return this.getSnapshot();
  }

  public getNextRetryDelayMs(): number | null {
    if (this.state.state !== "reconnecting") {
      return null;
    }

    const delayIndex = Math.min(this.state.retryAttempt, this.retryBackoffMs.length - 1);
    const delay = this.retryBackoffMs[delayIndex];
    const elapsed = this.getElapsedMs();
    if (elapsed + delay > this.retryWindowMs) {
      return null;
    }

    return delay;
  }

  private getElapsedMs(): number {
    if (this.reconnectStartedAt === null) {
      return 0;
    }

    return Math.max(0, this.now() - this.reconnectStartedAt);
  }

  private isRetryWindowExhausted(): boolean {
    return this.getElapsedMs() >= this.retryWindowMs;
  }
}
