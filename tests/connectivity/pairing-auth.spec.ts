import { PairingService } from "../../apps/desktop/src/connectivity/pairing/pairing-service";
import { SessionAuthGuard } from "../../apps/desktop/src/connectivity/session/session-auth-guard";
import {
  InMemoryTrustStorePersistence,
  TrustedDeviceStore
} from "../../apps/desktop/src/connectivity/trust/trust-store";
import { PairingFlow } from "../../apps/mobile/src/connectivity/pairing/usePairingFlow";

describe("pairing approval gate", () => {
  it("keeps QR pairing pending until desktop explicitly approves", async () => {
    const enrollments: Array<{ deviceId: string; hostId: string }> = [];
    const service = new PairingService(
      {
        async enrollTrustedDevice(entry) {
          enrollments.push({ deviceId: entry.deviceId, hostId: entry.hostId });
        }
      },
      {
        hostId: "host-123",
        idGenerator: () => "pair-qr",
        codeGenerator: () => "123456",
        now: () => "2026-02-27T00:00:00.000Z"
      }
    );

    const flow = new PairingFlow(
      {
        async requestPairing(input) {
          return service.requestPairing(input);
        },
        async getPairingStatus(challengeId) {
          return service.getPairingStatus(challengeId);
        }
      },
      "phone-abc"
    );

    const pendingState = await flow.startQrPairing("phone");
    expect(pendingState.status).toBe("pending");
    expect(pendingState.qrValue).toContain("pair-qr");
    expect(enrollments).toHaveLength(0);

    await flow.refreshStatus();
    expect(flow.getState().status).toBe("pending");

    await service.approvePairing("pair-qr");
    const approvedState = await flow.refreshStatus();

    expect(approvedState.status).toBe("approved");
    expect(enrollments).toEqual([{ deviceId: "phone-abc", hostId: "host-123" }]);
  });

  it("supports code pairing initiated by desktop and returns denial reason", async () => {
    const service = new PairingService(
      {
        async enrollTrustedDevice() {
          return;
        }
      },
      {
        hostId: "host-123",
        idGenerator: () => "pair-code",
        codeGenerator: () => "654321",
        now: () => "2026-02-27T00:00:00.000Z"
      }
    );

    const flow = new PairingFlow(
      {
        async requestPairing(input) {
          return service.requestPairing(input);
        },
        async getPairingStatus(challengeId) {
          return service.getPairingStatus(challengeId);
        }
      },
      "phone-xyz"
    );

    const pendingState = await flow.startCodePairing("desktop");
    expect(pendingState.status).toBe("pending");
    expect(pendingState.sixDigitCode).toBe("654321");

    service.denyPairing("pair-code", "denied_by_desktop");
    const deniedState = await flow.refreshStatus();

    expect(deniedState.status).toBe("denied");
    expect(deniedState.failureReason).toBe("denied_by_desktop");
  });
});

describe("trust persistence and action authorization", () => {
  it("persists trusted records across store instances", async () => {
    const persistence = new InMemoryTrustStorePersistence();
    const trustStoreA = new TrustedDeviceStore(persistence);
    await trustStoreA.enrollTrustedDevice({
      deviceId: "phone-123",
      hostId: "host-123",
      pairedAt: "2026-02-27T00:00:00.000Z"
    });

    const trustStoreB = new TrustedDeviceStore(persistence);
    const trusted = await trustStoreB.isTrusted("phone-123", "host-123");
    expect(trusted).toBe(true);
  });

  it("rejects actions from untrusted or invalid sessions with explicit reasons", async () => {
    const persistence = new InMemoryTrustStorePersistence();
    const trustStore = new TrustedDeviceStore(persistence);

    const guard = new SessionAuthGuard(trustStore, {
      async validateSession(sessionId) {
        return sessionId === "good-session";
      }
    });

    const untrusted = await guard.authorizeAction({
      sessionId: "good-session",
      deviceId: "phone-untrusted",
      hostId: "host-123"
    });
    expect(untrusted).toEqual({
      authorized: false,
      reason: "untrusted_device"
    });

    await trustStore.enrollTrustedDevice({
      deviceId: "phone-trusted",
      hostId: "host-123",
      pairedAt: "2026-02-27T00:00:00.000Z"
    });

    const invalidSession = await guard.authorizeAction({
      sessionId: "expired-session",
      deviceId: "phone-trusted",
      hostId: "host-123"
    });
    expect(invalidSession).toEqual({
      authorized: false,
      reason: "invalid_session"
    });

    const allowed = await guard.authorizeAction({
      sessionId: "good-session",
      deviceId: "phone-trusted",
      hostId: "host-123"
    });
    expect(allowed).toEqual({ authorized: true });
  });
});
