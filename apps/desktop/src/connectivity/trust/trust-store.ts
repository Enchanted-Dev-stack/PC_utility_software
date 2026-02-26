import type { PairingTrustEnrollment } from "../pairing/pairing-service";

export interface TrustedDeviceRecord {
  deviceId: string;
  hostId: string;
  pairedAt: string;
  lastApprovedAt: string;
}

export interface TrustStorePersistence {
  read(): Promise<TrustedDeviceRecord[]>;
  write(records: TrustedDeviceRecord[]): Promise<void>;
}

export class InMemoryTrustStorePersistence implements TrustStorePersistence {
  private records: TrustedDeviceRecord[];

  public constructor(seed: TrustedDeviceRecord[] = []) {
    this.records = [...seed];
  }

  public async read(): Promise<TrustedDeviceRecord[]> {
    return this.records.map((record) => ({ ...record }));
  }

  public async write(records: TrustedDeviceRecord[]): Promise<void> {
    this.records = records.map((record) => ({ ...record }));
  }
}

export class TrustedDeviceStore implements PairingTrustEnrollment {
  private readonly persistence: TrustStorePersistence;
  private cacheByScope: Map<string, TrustedDeviceRecord> | null;

  public constructor(persistence: TrustStorePersistence) {
    this.persistence = persistence;
    this.cacheByScope = null;
  }

  public async enrollTrustedDevice(entry: {
    deviceId: string;
    hostId: string;
    pairedAt: string;
  }): Promise<void> {
    const cache = await this.getCache();
    const scopedKey = this.buildScopedKey(entry.deviceId, entry.hostId);
    const existing = cache.get(scopedKey);

    cache.set(scopedKey, {
      deviceId: entry.deviceId,
      hostId: entry.hostId,
      pairedAt: existing ? existing.pairedAt : entry.pairedAt,
      lastApprovedAt: entry.pairedAt
    });

    await this.persist(cache);
  }

  public async isTrusted(deviceId: string, hostId: string): Promise<boolean> {
    const cache = await this.getCache();
    return cache.has(this.buildScopedKey(deviceId, hostId));
  }

  public async revokeTrustedDevice(deviceId: string, hostId: string): Promise<boolean> {
    const cache = await this.getCache();
    const deleted = cache.delete(this.buildScopedKey(deviceId, hostId));

    if (deleted) {
      await this.persist(cache);
    }

    return deleted;
  }

  public async getTrustedDevices(): Promise<TrustedDeviceRecord[]> {
    const cache = await this.getCache();
    return Array.from(cache.values()).map((record) => ({ ...record }));
  }

  private async getCache(): Promise<Map<string, TrustedDeviceRecord>> {
    if (this.cacheByScope) {
      return this.cacheByScope;
    }

    const records = await this.persistence.read();
    const cache = new Map<string, TrustedDeviceRecord>();
    records.forEach((record) => {
      cache.set(this.buildScopedKey(record.deviceId, record.hostId), { ...record });
    });

    this.cacheByScope = cache;
    return cache;
  }

  private async persist(cache: Map<string, TrustedDeviceRecord>): Promise<void> {
    await this.persistence.write(Array.from(cache.values()));
  }

  private buildScopedKey(deviceId: string, hostId: string): string {
    return `${hostId}::${deviceId}`;
  }
}
