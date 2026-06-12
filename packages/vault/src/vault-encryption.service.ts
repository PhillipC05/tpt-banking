import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Vault Transit Secrets Engine encryption service.
 *
 * Uses HashiCorp Vault's Transit engine to perform AES-256-GCM encryption
 * and decryption of sensitive PII columns (SSN, tax ID, account numbers).
 *
 * The Transit engine is a "encryption-as-a-service" model — the plaintext
 * is sent to Vault, which returns a `vault:v1:...` ciphertext. Keys are
 * managed entirely by Vault and are never exposed to the application.
 *
 * Setup (run once against dev Vault):
 *   vault secrets enable transit
 *   vault write -f transit/keys/tpt-banking-pii type=aes256-gcm96
 *
 * Environment variables:
 *   VAULT_ADDR        — e.g. http://localhost:8200
 *   VAULT_TOKEN       — dev: dev-root-token; prod: short-lived AppRole token
 *   VAULT_TRANSIT_KEY — key name in Transit engine (default: tpt-banking-pii)
 */
@Injectable()
export class VaultEncryptionService implements OnModuleInit {
  private readonly logger = new Logger(VaultEncryptionService.name);
  private readonly vaultAddr: string;
  private readonly vaultToken: string;
  private readonly transitKey: string;

  constructor(private readonly config: ConfigService) {
    this.vaultAddr = this.config.get<string>('VAULT_ADDR', 'http://localhost:8200');
    this.vaultToken = this.config.get<string>('VAULT_TOKEN', 'dev-root-token');
    this.transitKey = this.config.get<string>('VAULT_TRANSIT_KEY', 'tpt-banking-pii');
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTransitKeyExists();
      this.logger.log(`Vault Transit key '${this.transitKey}' verified at ${this.vaultAddr}`);
    } catch (err) {
      this.logger.warn(
        `Vault Transit key check failed — PII encryption will be degraded: ${(err as Error).message}`,
      );
    }
  }

  /**
   * Encrypts a plaintext string using Vault Transit AES-256-GCM96.
   * Returns a `vault:v1:<base64>` ciphertext string.
   */
  async encrypt(plaintext: string): Promise<string> {
    const encoded = Buffer.from(plaintext, 'utf8').toString('base64');
    const response = await this.vaultRequest<{ data: { ciphertext: string } }>(
      'POST',
      `/v1/transit/encrypt/${this.transitKey}`,
      { plaintext: encoded },
    );
    return response.data.ciphertext;
  }

  /**
   * Decrypts a `vault:v1:<base64>` ciphertext and returns the original plaintext.
   */
  async decrypt(ciphertext: string): Promise<string> {
    const response = await this.vaultRequest<{ data: { plaintext: string } }>(
      'POST',
      `/v1/transit/decrypt/${this.transitKey}`,
      { ciphertext },
    );
    return Buffer.from(response.data.plaintext, 'base64').toString('utf8');
  }

  /**
   * Re-encrypts a ciphertext under the latest key version.
   * Call periodically as part of key rotation.
   */
  async rewrap(ciphertext: string): Promise<string> {
    const response = await this.vaultRequest<{ data: { ciphertext: string } }>(
      'POST',
      `/v1/transit/rewrap/${this.transitKey}`,
      { ciphertext },
    );
    return response.data.ciphertext;
  }

  private async ensureTransitKeyExists(): Promise<void> {
    // Try to read the key — if it doesn't exist, create it (dev only)
    try {
      await this.vaultRequest('GET', `/v1/transit/keys/${this.transitKey}`);
    } catch {
      this.logger.log(`Creating Transit key '${this.transitKey}'...`);
      await this.vaultRequest('POST', `/v1/transit/keys/${this.transitKey}`, {
        type: 'aes256-gcm96',
      });
    }
  }

  private async vaultRequest<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: Record<string, unknown>,
  ): Promise<T> {
    const url = `${this.vaultAddr}${path}`;
    const res = await fetch(url, {
      method,
      headers: {
        'X-Vault-Token': this.vaultToken,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Vault ${method} ${path} → ${res.status}: ${text}`);
    }

    if (res.status === 204) return {} as T;
    return res.json() as Promise<T>;
  }
}
