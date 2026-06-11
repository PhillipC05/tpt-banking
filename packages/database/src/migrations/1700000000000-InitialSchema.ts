import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Initial database schema migration.
 *
 * Creates all core tables, indexes, foreign keys, and the critical
 * PostgreSQL trigger that maintains account balances via double-entry bookkeeping.
 *
 * IMPORTANT: The trigger `update_account_balance_on_ledger_entry` is the sole
 * mechanism by which account balances are updated. Application code must never
 * issue a direct UPDATE to accounts.balance or accounts.available_balance.
 */
export class InitialSchema1700000000000 implements MigrationInterface {
  name = 'InitialSchema1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum Types ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE customer_status_enum AS ENUM (
        'PROSPECT', 'PENDING_KYC', 'ACTIVE', 'SUSPENDED', 'CLOSED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE customer_tier_enum AS ENUM (
        'RETAIL', 'PREFERRED', 'HNW', 'UHNW', 'VIP'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE kyc_status_enum AS ENUM (
        'NOT_STARTED', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'EXPIRED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE account_type_enum AS ENUM (
        'CHECKING', 'SAVINGS', 'MONEY_MARKET', 'CERTIFICATE_OF_DEPOSIT',
        'LOAN', 'INVESTMENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE account_status_enum AS ENUM (
        'PENDING', 'ACTIVE', 'DORMANT', 'FROZEN', 'CLOSED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE journal_type_enum AS ENUM (
        'TRANSFER', 'DEPOSIT', 'WITHDRAWAL', 'FEE', 'INTEREST',
        'ADJUSTMENT', 'REVERSAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE journal_status_enum AS ENUM (
        'PENDING', 'POSTED', 'REVERSED', 'FAILED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE ledger_entry_type_enum AS ENUM (
        'DEBIT', 'CREDIT'
      )
    `);

    // ─── customers table ─────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE customers (
        id                UUID              NOT NULL DEFAULT gen_random_uuid(),
        customer_number   VARCHAR(20)       NOT NULL,
        email             VARCHAR(255)      NOT NULL,
        phone             VARCHAR(30),
        first_name        VARCHAR(100)      NOT NULL,
        last_name         VARCHAR(100)      NOT NULL,
        middle_name       VARCHAR(100),
        date_of_birth     DATE              NOT NULL,
        ssn_encrypted     BYTEA,
        ssn_last4         CHAR(4),
        nationality       VARCHAR(3)        NOT NULL,
        tax_id            VARCHAR(50),
        status            customer_status_enum NOT NULL DEFAULT 'PROSPECT',
        tier              customer_tier_enum   NOT NULL DEFAULT 'RETAIL',
        kyc_status        kyc_status_enum      NOT NULL DEFAULT 'NOT_STARTED',
        kyc_completed_at  TIMESTAMPTZ,
        created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_customers PRIMARY KEY (id),
        CONSTRAINT uq_customers_customer_number UNIQUE (customer_number),
        CONSTRAINT uq_customers_email UNIQUE (email)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_customers_email ON customers (email)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_customers_customer_number ON customers (customer_number)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_customers_status ON customers (status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_customers_tier ON customers (tier)
    `);

    // ─── accounts table ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE accounts (
        id                UUID              NOT NULL DEFAULT gen_random_uuid(),
        account_number    VARCHAR(20)       NOT NULL,
        customer_id       UUID              NOT NULL,
        type              account_type_enum   NOT NULL,
        status            account_status_enum NOT NULL DEFAULT 'PENDING',
        currency          VARCHAR(3)        NOT NULL DEFAULT 'USD',
        balance           NUMERIC(20, 6)    NOT NULL DEFAULT 0,
        available_balance NUMERIC(20, 6)    NOT NULL DEFAULT 0,
        hold_amount       NUMERIC(20, 6)    NOT NULL DEFAULT 0,
        overdraft_limit   NUMERIC(20, 6)    NOT NULL DEFAULT 0,
        interest_rate     NUMERIC(8, 6),
        opened_at         TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        closed_at         TIMESTAMPTZ,
        created_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_accounts PRIMARY KEY (id),
        CONSTRAINT uq_accounts_account_number UNIQUE (account_number),
        CONSTRAINT fk_accounts_customer_id
          FOREIGN KEY (customer_id) REFERENCES customers (id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_accounts_account_number ON accounts (account_number)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_accounts_customer_id ON accounts (customer_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_accounts_status ON accounts (status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_accounts_currency ON accounts (currency)
    `);

    // ─── journals table ──────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE journals (
        id               UUID                 NOT NULL DEFAULT gen_random_uuid(),
        journal_number   VARCHAR(20)          NOT NULL,
        description      VARCHAR(500)         NOT NULL,
        type             journal_type_enum    NOT NULL,
        status           journal_status_enum  NOT NULL DEFAULT 'PENDING',
        reference        VARCHAR(255),
        idempotency_key  VARCHAR(128)         UNIQUE,
        posted_at        TIMESTAMPTZ,
        reversal_of      UUID,
        created_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_journals PRIMARY KEY (id),
        CONSTRAINT uq_journals_journal_number UNIQUE (journal_number),
        CONSTRAINT fk_journals_reversal_of
          FOREIGN KEY (reversal_of) REFERENCES journals (id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_journals_idempotency_key
        ON journals (idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);
    await queryRunner.query(`
      CREATE INDEX idx_journals_status ON journals (status)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_journals_type ON journals (type)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_journals_posted_at ON journals (posted_at)
    `);

    // ─── ledger_entries table ────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE ledger_entries (
        id            UUID                   NOT NULL DEFAULT gen_random_uuid(),
        journal_id    UUID                   NOT NULL,
        account_id    UUID                   NOT NULL,
        type          ledger_entry_type_enum NOT NULL,
        amount        NUMERIC(20, 6)         NOT NULL,
        currency      VARCHAR(3)             NOT NULL,
        balance_after NUMERIC(20, 6)         NOT NULL DEFAULT 0,
        description   VARCHAR(500),
        created_at    TIMESTAMPTZ            NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_ledger_entries PRIMARY KEY (id),
        CONSTRAINT ck_ledger_entries_amount_positive
          CHECK (amount > 0),
        CONSTRAINT fk_ledger_entries_journal_id
          FOREIGN KEY (journal_id) REFERENCES journals (id)
          ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT fk_ledger_entries_account_id
          FOREIGN KEY (account_id) REFERENCES accounts (id)
          ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX idx_ledger_entries_account_id ON ledger_entries (account_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ledger_entries_journal_id ON ledger_entries (journal_id)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ledger_entries_account_created
        ON ledger_entries (account_id, created_at DESC)
    `);
    await queryRunner.query(`
      CREATE INDEX idx_ledger_entries_currency ON ledger_entries (currency)
    `);

    // ─── updated_at trigger function ─────────────────────────────────────────

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_customers_updated_at
        BEFORE UPDATE ON customers
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_accounts_updated_at
        BEFORE UPDATE ON accounts
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_journals_updated_at
        BEFORE UPDATE ON journals
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);

    // ─── Account balance trigger ─────────────────────────────────────────────
    //
    // This is the SOLE mechanism by which account balances are updated.
    // When a ledger entry is inserted:
    //   1. Recompute the account balance from ALL ledger entries for that account.
    //   2. Update accounts.balance and accounts.available_balance.
    //   3. Set the balance_after snapshot on the newly inserted entry.
    //
    // Using a sum-based approach (rather than incremental) ensures correctness
    // even under concurrent inserts, at the cost of slightly more I/O per insert.
    // For production at high volume, consider an incremental approach with
    // advisory locks or serialisable isolation.

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_account_balance_on_ledger_entry()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      AS $$
      DECLARE
        v_new_balance       NUMERIC(20, 6);
        v_hold_amount       NUMERIC(20, 6);
        v_new_avail_balance NUMERIC(20, 6);
        v_overdraft_limit   NUMERIC(20, 6);
      BEGIN
        -- Compute the new balance as sum(CREDIT) - sum(DEBIT) for this account
        SELECT
          COALESCE(
            SUM(
              CASE
                WHEN le.type = 'CREDIT' THEN  le.amount
                WHEN le.type = 'DEBIT'  THEN -le.amount
                ELSE 0
              END
            ),
            0
          )
        INTO v_new_balance
        FROM ledger_entries le
        WHERE le.account_id = NEW.account_id;

        -- Get current hold amount and overdraft limit from the account
        SELECT hold_amount, overdraft_limit
        INTO v_hold_amount, v_overdraft_limit
        FROM accounts
        WHERE id = NEW.account_id
        FOR UPDATE;

        -- Available balance = balance - holds + overdraft_limit
        -- (overdraft_limit adds to available without affecting booked balance)
        v_new_avail_balance := v_new_balance - v_hold_amount + v_overdraft_limit;

        -- Update the account balance columns
        UPDATE accounts
        SET
          balance           = v_new_balance,
          available_balance = v_new_avail_balance,
          updated_at        = NOW()
        WHERE id = NEW.account_id;

        -- Stamp the balance_after snapshot on the newly inserted entry
        NEW.balance_after := v_new_balance;

        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_update_account_balance
        BEFORE INSERT ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION update_account_balance_on_ledger_entry()
    `);

    // ─── Hold amount trigger ─────────────────────────────────────────────────
    //
    // When hold_amount changes on an account, recompute available_balance.

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION update_available_balance_on_hold_change()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      AS $$
      BEGIN
        -- Only fire when hold_amount actually changed
        IF OLD.hold_amount IS DISTINCT FROM NEW.hold_amount THEN
          NEW.available_balance := NEW.balance - NEW.hold_amount + NEW.overdraft_limit;
        END IF;
        RETURN NEW;
      END;
      $$
    `);

    await queryRunner.query(`
      CREATE TRIGGER trg_update_available_balance_on_hold
        BEFORE UPDATE OF hold_amount ON accounts
        FOR EACH ROW EXECUTE FUNCTION update_available_balance_on_hold_change()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop triggers first
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_update_available_balance_on_hold ON accounts`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_update_account_balance ON ledger_entries`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_journals_updated_at ON journals`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_accounts_updated_at ON accounts`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_customers_updated_at ON customers`);

    // Drop trigger functions
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_available_balance_on_hold_change()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS update_account_balance_on_ledger_entry()`);
    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at()`);

    // Drop tables in dependency order
    await queryRunner.query(`DROP TABLE IF EXISTS ledger_entries`);
    await queryRunner.query(`DROP TABLE IF EXISTS journals`);
    await queryRunner.query(`DROP TABLE IF EXISTS accounts`);
    await queryRunner.query(`DROP TABLE IF EXISTS customers`);

    // Drop enum types
    await queryRunner.query(`DROP TYPE IF EXISTS ledger_entry_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS journal_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS journal_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS account_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS account_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS kyc_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS customer_tier_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS customer_status_enum`);
  }
}
