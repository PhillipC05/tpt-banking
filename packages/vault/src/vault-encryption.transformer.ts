import { ValueTransformer } from 'typeorm';

/**
 * TypeORM value transformer for Vault-encrypted columns.
 *
 * Stores the raw Vault ciphertext (`vault:v1:...`) in the database column.
 * The actual encrypt/decrypt calls happen at the service layer (VaultEncryptionService)
 * rather than in the transformer, because the transformer is synchronous and
 * Vault API calls are async.
 *
 * Usage pattern at the service layer:
 *
 *   // Write
 *   customer.ssnEncrypted = await this.vaultEncryption.encrypt(ssn);
 *
 *   // Read
 *   const ssn = await this.vaultEncryption.decrypt(customer.ssnEncrypted);
 *
 * The transformer handles the string↔Buffer conversion for `bytea` columns
 * (PostgreSQL stores the ciphertext as raw bytes).
 */
export const VaultCiphertextTransformer: ValueTransformer = {
  /** Called before writing to the DB — converts string to Buffer for bytea */
  to(value: string | null | undefined): Buffer | null {
    if (value == null) return null;
    return Buffer.from(value, 'utf8');
  },

  /** Called after reading from the DB — converts Buffer back to string */
  from(value: Buffer | string | null | undefined): string | null {
    if (value == null) return null;
    if (Buffer.isBuffer(value)) return value.toString('utf8');
    return value as string;
  },
};
