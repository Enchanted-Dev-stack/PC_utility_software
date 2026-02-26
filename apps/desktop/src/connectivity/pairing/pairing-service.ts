export type PairingMode = "qr" | "code";
export type PairingInitiator = "phone" | "desktop";

export type PairingDeniedReason =
  | "denied_by_desktop"
  | "challenge_not_found"
  | "challenge_already_resolved";

export type PairingEventType =
  | "pairing_request"
  | "pairing_pending"
  | "pairing_approved"
  | "pairing_denied";

export interface PairingRequest {
  requesterDeviceId: string;
  mode: PairingMode;
  initiatedBy: PairingInitiator;
}

export interface PairingChallenge {
  challengeId: string;
  hostId: string;
  requesterDeviceId: string;
  mode: PairingMode;
  initiatedBy: PairingInitiator;
  sixDigitCode: string;
  qrValue: string;
  createdAt: string;
}

export interface PairingStatusEvent {
  type: PairingEventType;
  challengeId: string;
  challenge?: PairingChallenge;
  reason?: PairingDeniedReason;
  timestamp: string;
}

export interface PairingTrustEnrollment {
  enrollTrustedDevice(entry: {
    deviceId: string;
    hostId: string;
    pairedAt: string;
  }): Promise<void>;
}

export interface PairingServiceOptions {
  hostId: string;
  now?: () => string;
  idGenerator?: () => string;
  codeGenerator?: () => string;
}

interface PairingChallengeRecord {
  challenge: PairingChallenge;
  resolved: boolean;
}

export class PairingService {
  private readonly trustEnrollment: PairingTrustEnrollment;
  private readonly options: PairingServiceOptions;
  private readonly challengeRecords: Map<string, PairingChallengeRecord>;
  private readonly latestStatusByChallenge: Map<string, PairingStatusEvent>;

  public constructor(trustEnrollment: PairingTrustEnrollment, options: PairingServiceOptions) {
    this.trustEnrollment = trustEnrollment;
    this.options = options;
    this.challengeRecords = new Map<string, PairingChallengeRecord>();
    this.latestStatusByChallenge = new Map<string, PairingStatusEvent>();
  }

  public async requestPairing(request: PairingRequest): Promise<PairingStatusEvent> {
    const challenge = this.createChallenge(request);
    this.challengeRecords.set(challenge.challengeId, {
      challenge,
      resolved: false
    });

    this.saveStatus({
      type: "pairing_request",
      challengeId: challenge.challengeId,
      challenge,
      timestamp: this.now()
    });

    return this.saveStatus({
      type: "pairing_pending",
      challengeId: challenge.challengeId,
      challenge,
      timestamp: this.now()
    });
  }

  public async approvePairing(challengeId: string): Promise<PairingStatusEvent> {
    const challengeRecord = this.challengeRecords.get(challengeId);
    if (!challengeRecord) {
      return this.saveStatus({
        type: "pairing_denied",
        challengeId,
        reason: "challenge_not_found",
        timestamp: this.now()
      });
    }

    if (challengeRecord.resolved) {
      return this.saveStatus({
        type: "pairing_denied",
        challengeId,
        challenge: challengeRecord.challenge,
        reason: "challenge_already_resolved",
        timestamp: this.now()
      });
    }

    challengeRecord.resolved = true;
    await this.trustEnrollment.enrollTrustedDevice({
      deviceId: challengeRecord.challenge.requesterDeviceId,
      hostId: challengeRecord.challenge.hostId,
      pairedAt: this.now()
    });

    return this.saveStatus({
      type: "pairing_approved",
      challengeId,
      challenge: challengeRecord.challenge,
      timestamp: this.now()
    });
  }

  public denyPairing(challengeId: string, reason: PairingDeniedReason = "denied_by_desktop"): PairingStatusEvent {
    const challengeRecord = this.challengeRecords.get(challengeId);
    if (challengeRecord) {
      challengeRecord.resolved = true;
    }

    return this.saveStatus({
      type: "pairing_denied",
      challengeId,
      challenge: challengeRecord?.challenge,
      reason,
      timestamp: this.now()
    });
  }

  public getPairingStatus(challengeId: string): PairingStatusEvent {
    const status = this.latestStatusByChallenge.get(challengeId);
    if (status) {
      return status;
    }

    return {
      type: "pairing_denied",
      challengeId,
      reason: "challenge_not_found",
      timestamp: this.now()
    };
  }

  private saveStatus(status: PairingStatusEvent): PairingStatusEvent {
    this.latestStatusByChallenge.set(status.challengeId, status);
    return status;
  }

  private createChallenge(request: PairingRequest): PairingChallenge {
    const challengeId = this.options.idGenerator ? this.options.idGenerator() : this.defaultIdGenerator();
    const sixDigitCode = this.options.codeGenerator ? this.options.codeGenerator() : this.defaultCodeGenerator();
    const createdAt = this.now();

    return {
      challengeId,
      hostId: this.options.hostId,
      requesterDeviceId: request.requesterDeviceId,
      mode: request.mode,
      initiatedBy: request.initiatedBy,
      sixDigitCode,
      qrValue: `pc-remote://pair/${challengeId}`,
      createdAt
    };
  }

  private now(): string {
    return this.options.now ? this.options.now() : new Date().toISOString();
  }

  private defaultIdGenerator(): string {
    return `pair-${Math.random().toString(36).slice(2, 10)}`;
  }

  private defaultCodeGenerator(): string {
    const raw = Math.floor(Math.random() * 1000000);
    return raw.toString().padStart(6, "0");
  }
}
