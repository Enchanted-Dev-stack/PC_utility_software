import { createDiscoveryEnvelope, type DiscoveryEnvelope, type DiscoveryHostMetadata, type ManualConnectPayload, type ManualConnectResultPayload } from "../../../../../shared/src/contracts/connectivity/discovery";

export interface ManualConnectAdapter {
  handshake(ipAddress: string): Promise<DiscoveryHostMetadata | null>;
}

export interface ManualConnectPersistence {
  persistLastSuccessfulHost(host: DiscoveryHostMetadata): Promise<void>;
}

export interface ManualConnectValidationResult {
  valid: boolean;
  normalizedIp?: string;
}

const IPV4_PATTERN = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export function validateIpv4Address(input: string): ManualConnectValidationResult {
  const normalized = input.trim();
  if (!IPV4_PATTERN.test(normalized)) {
    return { valid: false };
  }

  return {
    valid: true,
    normalizedIp: normalized
  };
}

export class ManualConnectService {
  private readonly adapter: ManualConnectAdapter;
  private readonly persistence: ManualConnectPersistence;

  public constructor(adapter: ManualConnectAdapter, persistence: ManualConnectPersistence) {
    this.adapter = adapter;
    this.persistence = persistence;
  }

  public async connect(
    request: ManualConnectPayload
  ): Promise<DiscoveryEnvelope<ManualConnectResultPayload>> {
    const validation = validateIpv4Address(request.ipAddress);

    if (!validation.valid || !validation.normalizedIp) {
      return createDiscoveryEnvelope("manual_connect", {
        success: false,
        error: "invalid_ip"
      });
    }

    const host = await this.adapter.handshake(validation.normalizedIp);
    if (!host) {
      return createDiscoveryEnvelope("manual_connect", {
        success: false,
        error: "unreachable_host"
      });
    }

    await this.persistence.persistLastSuccessfulHost(host);

    return createDiscoveryEnvelope("manual_connect", {
      success: true,
      host
    });
  }
}
