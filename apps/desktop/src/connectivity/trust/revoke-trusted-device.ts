import { TrustedDeviceStore } from "./trust-store";

export interface SessionInvalidator {
  invalidateSessionsForDevice(deviceId: string, hostId: string): Promise<number>;
}

export interface RevokeTrustedDeviceInput {
  deviceId: string;
  hostId: string;
}

export interface RevokeTrustedDeviceResult {
  revoked: boolean;
  invalidatedSessions: number;
  unauthorizedReason: "none" | "untrusted_device";
}

export class TrustedDeviceRevoker {
  private readonly trustStore: TrustedDeviceStore;
  private readonly sessionInvalidator: SessionInvalidator;

  public constructor(trustStore: TrustedDeviceStore, sessionInvalidator: SessionInvalidator) {
    this.trustStore = trustStore;
    this.sessionInvalidator = sessionInvalidator;
  }

  public async revokeTrustedDevice(input: RevokeTrustedDeviceInput): Promise<RevokeTrustedDeviceResult> {
    const revoked = await this.trustStore.revokeTrustedDevice(input.deviceId, input.hostId);
    if (!revoked) {
      return {
        revoked: false,
        invalidatedSessions: 0,
        unauthorizedReason: "none"
      };
    }

    const invalidatedSessions = await this.sessionInvalidator.invalidateSessionsForDevice(
      input.deviceId,
      input.hostId
    );

    return {
      revoked: true,
      invalidatedSessions,
      unauthorizedReason: "untrusted_device"
    };
  }
}
