import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Migration: Users and Transactions tables.
 * Adds the users table (for authentication) and the transactions table
 * (for the transfer saga state machine).
 */
export class UsersAndTransactions1700000001000 implements MigrationInterface {
  name = 'UsersAndTransactions1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE user_status_enum AS ENUM (
        'ACTIVE', 'SUSPENDED', 'LOCKED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE transaction_type_enum AS ENUM (
        'INTERNAL_TRANSFER', 'DEPOSIT', 'WITHDRAWAL',
        'ACH', 'WIRE', 'SWIFT', 'RTP', 'FED_NOW'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE transaction_status_enum AS ENUM (
        'PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'REVERSED', 'CANCELLED'
      )
    `);

    // ─── users table ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE users (
        id                      UUID              NOT NULL DEFAULT gen_random_uuid(),
        email                   VARCHAR(255)      NOT NULL,
        password_hash           VARCHAR(255)      NOT NULL,
        first_name              VARCHAR(100)      NOT NULL,
        last_name               VARCHAR(100)      NOT NULL,
        phone                   VARCHAR(30),
        roles                   TEXT              NOT NULL DEFAULT 'retail_customer',
        status                  user_status_enum  NOT NULL DEFAULT 'ACTIVE',
        mfa_enabled             BOOLEAN           NOT NULL DEFAULT false,
        mfa_secret              VARCHAR(255),
        customer_id             UUID,
        last_login_at           TIMESTAMPTZ,
        failed_login_attempts   INT               NOT NULL DEFAULT 0,
        locked_until            TIMESTAMPTZ,
        created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_users PRIMARY KEY (id),
        CONSTRAINT uq_users_email UNIQUE (email)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_users_email ON users (email)`);
    await queryRunner.query(`CREATE INDEX idx_users_customer_id ON users (customer_id)`);

    await queryRunner.query(`
      CREATE TRIGGER trg_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ─── transactions table ──────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE transactions (
        id                    UUID                     NOT NULL DEFAULT gen_random_uuid(),
        transaction_number    VARCHAR(30)              NOT NULL,
        type                  transaction_type_enum    NOT NULL,
        status                transaction_status_enum  NOT NULL DEFAULT 'PENDING',
        source_account_id     UUID,
        destination_account_id UUID,
        amount                NUMERIC(20, 6)           NOT NULL,
        currency              VARCHAR(3)               NOT NULL,
        fee                   NUMERIC(20, 6)           NOT NULL DEFAULT 0,
        description           VARCHAR(500),
        journal_id            UUID,
        idempotency_key       VARCHAR(128)             NOT NULL,
        failure_reason        VARCHAR(500),
        hold_placed           BOOLEAN                  NOT NULL DEFAULT false,
        completed_at          TIMESTAMPTZ,
        created_at            TIMESTAMPTZ              NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_transactions PRIMARY KEY (id),
        CONSTRAINT uq_transactions_number UNIQUE (transaction_number),
        CONSTRAINT uq_transactions_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT ck_transactions_amount_positive CHECK (amount > 0)
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_transactions_number ON transactions (transaction_number)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_idempotency_key ON transactions (idempotency_key)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_source_account ON transactions (source_account_id)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_destination_account ON transactions (destination_account_id)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_status ON transactions (status)`);
    await queryRunner.query(`CREATE INDEX idx_transactions_created_at ON transactions (created_at DESC)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_users_updated_at ON users`);
    await queryRunner.query(`DROP TABLE IF EXISTS transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS users`);
    await queryRunner.query(`DROP TYPE IF EXISTS transaction_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS transaction_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS user_status_enum`);
  }
}
