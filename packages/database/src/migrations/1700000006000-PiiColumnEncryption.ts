import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: PII Column Encryption
 *
 * Renames `customers.tax_id` (VARCHAR plaintext) to `customers.tax_id_encrypted` (BYTEA)
 * and aligns `customers.ssn_encrypted` to BYTEA (already typed correctly — ensures consistency).
 *
 * After running this migration:
 *   1. Run the one-time PII backfill script (scripts/encrypt-pii-backfill.ts) to
 *      encrypt existing plaintext values using the Vault Transit engine.
 *   2. The application will then encrypt/decrypt on write/read via VaultEncryptionService.
 *
 * Rollback: renames column back and converts BYTEA → VARCHAR (truncated to 50 chars).
 */
export class PiiColumnEncryption1700000006000 implements MigrationInterface {
  name = 'PiiColumnEncryption1700000006000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Rename tax_id → tax_id_encrypted and change type to BYTEA for Vault ciphertext
    await queryRunner.query(`
      ALTER TABLE customers
        RENAME COLUMN tax_id TO tax_id_encrypted
    `);

    await queryRunner.query(`
      ALTER TABLE customers
        ALTER COLUMN tax_id_encrypted TYPE BYTEA
        USING encode(tax_id_encrypted::text, 'escape')::bytea
    `);

    // Ensure ssn_encrypted is BYTEA (it was declared bytea in the original schema,
    // but this makes the intent explicit and handles any VARCHAR drift in dev envs)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'customers'
            AND column_name = 'ssn_encrypted'
            AND data_type != 'bytea'
        ) THEN
          ALTER TABLE customers ALTER COLUMN ssn_encrypted TYPE BYTEA
          USING ssn_encrypted::bytea;
        END IF;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Convert BYTEA back to VARCHAR and rename
    await queryRunner.query(`
      ALTER TABLE customers
        ALTER COLUMN tax_id_encrypted TYPE VARCHAR(50)
        USING convert_from(tax_id_encrypted, 'UTF8')
    `);

    await queryRunner.query(`
      ALTER TABLE customers
        RENAME COLUMN tax_id_encrypted TO tax_id
    `);
  }
}
