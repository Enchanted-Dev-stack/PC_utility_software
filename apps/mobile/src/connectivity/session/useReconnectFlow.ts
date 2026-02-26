import {
  ConnectionStateSnapshot,
  DisconnectReason,
  ReconnectStateMachine,
  ReconnectStateMachineOptions
} from "../../../../desktop/src/connectivity/session/reconnect-state-machine";

export type { ConnectionStateSnapshot, DisconnectReason };

export interface ReconnectClient {
  connectToHost(hostId: string): Promise<boolean>;
}

export interface ReconnectFlowOptions extends ReconnectStateMachineOptions {
  sleep?: (ms: number) => Promise<void>;
  onStateChange?: (state: ConnectionStateSnapshot) => void;
}

export class ReconnectFlow {
  private readonly client: ReconnectClient;
  private readonly machine: ReconnectStateMachine;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly onStateChange?: (state: ConnectionStateSnapshot) => void;

  private reconnectRun: Promise<ConnectionStateSnapshot> | null;

  public constructor(client: ReconnectClient, options: ReconnectFlowOptions = {}) {
    this.client = client;
    this.machine = new ReconnectStateMachine(options);
    this.sleep = options.sleep ?? (async (ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.onStateChange = options.onStateChange;
    this.reconnectRun = null;
  }

  public getState(): ConnectionStateSnapshot {
    return this.machine.getSnapshot();
  }

  public markConnected(hostId: string): ConnectionStateSnapshot {
    return this.emit(this.machine.markConnected(hostId));
  }

  public switchHost(hostId: string): ConnectionStateSnapshot {
    return this.emit(this.machine.switchHost(hostId));
  }

  public async handleDisconnect(reason: DisconnectReason = "connection_lost"): Promise<ConnectionStateSnapshot> {
    const started = this.emit(this.machine.startReconnect(reason));
    if (started.state !== "reconnecting") {
      return started;
    }

    if (!this.reconnectRun) {
      this.reconnectRun = this.runReconnectLoop();
    }

    return this.reconnectRun;
  }

  public async retryNow(): Promise<ConnectionStateSnapshot> {
    if (this.machine.getSnapshot().state === "connected") {
      return this.machine.getSnapshot();
    }

    return this.handleDisconnect("connection_failed");
  }

  private async runReconnectLoop(): Promise<ConnectionStateSnapshot> {
    try {
      while (this.machine.getSnapshot().state === "reconnecting") {
        const hostId = this.machine.getTargetHostId();
        if (!hostId) {
          return this.emit(this.machine.startReconnect("host_unavailable"));
        }

        const connected = await this.client.connectToHost(hostId);
        if (connected) {
          return this.emit(this.machine.markConnected(hostId));
        }

        const failed = this.emit(this.machine.registerRetryFailure("connection_failed"));
        if (failed.state !== "reconnecting") {
          return failed;
        }

        const delay = this.machine.getNextRetryDelayMs();
        if (delay === null) {
          return this.emit(this.machine.registerRetryFailure("retry_window_exhausted"));
        }

        await this.sleep(delay);
      }

      return this.machine.getSnapshot();
    } finally {
      this.reconnectRun = null;
    }
  }

  private emit(state: ConnectionStateSnapshot): ConnectionStateSnapshot {
    if (this.onStateChange) {
      this.onStateChange(state);
    }

    return state;
  }
}
