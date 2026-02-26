export const DISCOVERY_MESSAGE_TYPES = [
  "scan_request",
  "scan_result",
  "manual_connect"
] as const;

export type DiscoveryMessageType = (typeof DISCOVERY_MESSAGE_TYPES)[number];

export interface DiscoveryHostMetadata {
  hostId: string;
  hostName: string;
  deviceId: string;
  lastSeen: string;
}

export interface DiscoveryEnvelope<TPayload> {
  type: DiscoveryMessageType;
  timestamp: string;
  payload: TPayload;
}

export interface ScanRequestPayload {
  requesterDeviceId: string;
}

export interface ScanResultPayload {
  hosts: DiscoveryHostMetadata[];
}

export interface ManualConnectPayload {
  ipAddress: string;
  requesterDeviceId: string;
}

export interface ManualConnectResultPayload {
  success: boolean;
  host?: DiscoveryHostMetadata;
  error?: "invalid_ip" | "unreachable_host";
}

export function createDiscoveryEnvelope<TPayload>(
  type: DiscoveryMessageType,
  payload: TPayload,
  timestamp: string = new Date().toISOString()
): DiscoveryEnvelope<TPayload> {
  return {
    type,
    timestamp,
    payload
  };
}
