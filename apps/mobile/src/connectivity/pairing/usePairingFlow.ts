import type {
  PairingEventType,
  PairingInitiator,
  PairingMode,
  PairingStatusEvent
} from "../../../../../apps/desktop/src/connectivity/pairing/pairing-service";

export interface PairingClient {
  requestPairing(input: {
    requesterDeviceId: string;
    mode: PairingMode;
    initiatedBy: PairingInitiator;
  }): Promise<PairingStatusEvent>;
  getPairingStatus(challengeId: string): Promise<PairingStatusEvent>;
}

export interface PairingFlowState {
  status: "idle" | "pending" | "approved" | "denied";
  mode?: PairingMode;
  challengeId?: string;
  sixDigitCode?: string;
  qrValue?: string;
  failureReason?: string;
}

export class PairingFlow {
  private readonly client: PairingClient;
  private readonly requesterDeviceId: string;
  private state: PairingFlowState;

  public constructor(client: PairingClient, requesterDeviceId: string) {
    this.client = client;
    this.requesterDeviceId = requesterDeviceId;
    this.state = { status: "idle" };
  }

  public getState(): PairingFlowState {
    return { ...this.state };
  }

  public async startQrPairing(initiatedBy: PairingInitiator = "phone"): Promise<PairingFlowState> {
    return this.startPairing("qr", initiatedBy);
  }

  public async startCodePairing(initiatedBy: PairingInitiator = "phone"): Promise<PairingFlowState> {
    return this.startPairing("code", initiatedBy);
  }

  public async refreshStatus(): Promise<PairingFlowState> {
    if (!this.state.challengeId) {
      return this.getState();
    }

    const status = await this.client.getPairingStatus(this.state.challengeId);
    this.applyStatus(status);
    return this.getState();
  }

  private async startPairing(mode: PairingMode, initiatedBy: PairingInitiator): Promise<PairingFlowState> {
    const status = await this.client.requestPairing({
      requesterDeviceId: this.requesterDeviceId,
      mode,
      initiatedBy
    });

    this.applyStatus(status);
    return this.getState();
  }

  private applyStatus(event: PairingStatusEvent): void {
    if (!event.challenge) {
      this.state = {
        status: "denied",
        challengeId: event.challengeId,
        failureReason: event.reason
      };
      return;
    }

    const nextStatus = this.mapEventType(event.type);
    this.state = {
      status: nextStatus,
      mode: event.challenge.mode,
      challengeId: event.challengeId,
      sixDigitCode: event.challenge.sixDigitCode,
      qrValue: event.challenge.qrValue,
      failureReason: event.reason
    };
  }

  private mapEventType(type: PairingEventType): PairingFlowState["status"] {
    switch (type) {
      case "pairing_approved":
        return "approved";
      case "pairing_denied":
        return "denied";
      case "pairing_request":
      case "pairing_pending":
      default:
        return "pending";
    }
  }
}
