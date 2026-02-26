import { TrustedDeviceStore } from "../trust/trust-store";

export type UnauthorizedReason = "untrusted_device" | "invalid_session";

export interface ActionRequestEnvelope {
  sessionId: string;
  deviceId: string;
  hostId: string;
}

export interface SessionValidator {
  validateSession(sessionId: string, deviceId: string, hostId: string): Promise<boolean>;
}

export type ActionAuthorizationResult =
  | { authorized: true }
  | { authorized: false; reason: UnauthorizedReason };

export class SessionAuthGuard {
  private readonly trustStore: TrustedDeviceStore;
  private readonly sessionValidator: SessionValidator;

  public constructor(trustStore: TrustedDeviceStore, sessionValidator: SessionValidator) {
    this.trustStore = trustStore;
    this.sessionValidator = sessionValidator;
  }

  public async authorizeAction(request: ActionRequestEnvelope): Promise<ActionAuthorizationResult> {
    const trusted = await this.trustStore.isTrusted(request.deviceId, request.hostId);
    if (!trusted) {
      return {
        authorized: false,
        reason: "untrusted_device"
      };
    }

    const validSession = await this.sessionValidator.validateSession(
      request.sessionId,
      request.deviceId,
      request.hostId
    );

    if (!validSession) {
      return {
        authorized: false,
        reason: "invalid_session"
      };
    }

    return { authorized: true };
  }
}
