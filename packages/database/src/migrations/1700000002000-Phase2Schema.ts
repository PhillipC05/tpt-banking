import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 schema: Loans, Cards, ACH payments, Wire transfers.
 */
export class Phase2Schema1700000002000 implements MigrationInterface {
  name = 'Phase2Schema1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE loan_type_enum AS ENUM (
        'PERSONAL','AUTO','MORTGAGE','HOME_EQUITY','STUDENT','BUSINESS','LINE_OF_CREDIT'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE loan_status_enum AS ENUM (
        'PENDING','UNDER_REVIEW','APPROVED','DECLINED','ACTIVE',
        'DELINQUENT','DEFAULT','PAID_OFF','CHARGED_OFF'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE amortization_type_enum AS ENUM (
        'FIXED','VARIABLE','INTEREST_ONLY','BALLOON'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE loan_payment_status_enum AS ENUM (
        'SCHEDULED','PENDING','COMPLETED','FAILED','REVERSED','WAIVED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE loan_payment_type_enum AS ENUM (
        'REGULAR','EXTRA_PRINCIPAL','LATE_FEE','PAYOFF'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE card_type_enum AS ENUM (
        'DEBIT','CREDIT','PREPAID','VIRTUAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE card_status_enum AS ENUM (
        'PENDING','ACTIVE','FROZEN','CANCELLED','EXPIRED','LOST','STOLEN'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE card_network_enum AS ENUM (
        'VISA','MASTERCARD','AMEX'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE card_txn_status_enum AS ENUM (
        'PENDING','AUTHORIZED','CLEARED','DECLINED','REVERSED','DISPUTED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE card_txn_type_enum AS ENUM (
        'PURCHASE','CASH_ADVANCE','REFUND','FEE','INTEREST','PAYMENT','REVERSAL'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ach_direction_enum AS ENUM ('CREDIT','DEBIT')
    `);
    await queryRunner.query(`
      CREATE TYPE ach_status_enum AS ENUM (
        'PENDING','SUBMITTED','PENDING_AUTOMATIC_VERIFICATION',
        'PENDING_MANUAL_VERIFICATION','MICRO_DEPOSIT_VERIFICATION',
        'COMPLETED','FAILED','RETURNED','CANCELLED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE wire_type_enum AS ENUM ('DOMESTIC','INTERNATIONAL')
    `);
    await queryRunner.query(`
      CREATE TYPE wire_status_enum AS ENUM (
        'PENDING_APPROVAL','APPROVED','SUBMITTED','PROCESSING',
        'COMPLETED','FAILED','RECALLED','RETURNED'
      )
    `);

    // ─── loans table ─────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE loans (
        id                    UUID                    NOT NULL DEFAULT gen_random_uuid(),
        loan_number           VARCHAR(25)             NOT NULL,
        customer_id           UUID                    NOT NULL,
        account_id            UUID,
        type                  loan_type_enum          NOT NULL,
        status                loan_status_enum        NOT NULL DEFAULT 'PENDING',
        amortization_type     amortization_type_enum  NOT NULL DEFAULT 'FIXED',
        principal_amount      NUMERIC(20,6)           NOT NULL,
        outstanding_balance   NUMERIC(20,6)           NOT NULL DEFAULT 0,
        currency              VARCHAR(3)              NOT NULL DEFAULT 'USD',
        interest_rate         NUMERIC(8,6)            NOT NULL,
        term_months           INT                     NOT NULL,
        monthly_payment       NUMERIC(20,6),
        total_interest        NUMERIC(20,6),
        origination_fee       NUMERIC(20,6)           NOT NULL DEFAULT 0,
        credit_score          INT,
        debt_to_income_ratio  NUMERIC(5,4),
        collateral_description VARCHAR(500),
        collateral_value      NUMERIC(20,6),
        purpose               VARCHAR(500),
        approved_at           TIMESTAMPTZ,
        disbursed_at          TIMESTAMPTZ,
        first_payment_due     DATE,
        maturity_date         DATE,
        days_past_due         INT                     NOT NULL DEFAULT 0,
        paid_off_at           TIMESTAMPTZ,
        decline_reason        VARCHAR(500),
        underwriter_notes     TEXT,
        created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_loans PRIMARY KEY (id),
        CONSTRAINT uq_loans_loan_number UNIQUE (loan_number),
        CONSTRAINT fk_loans_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_loans_customer_id ON loans (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_loans_status ON loans (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_loans_updated_at
      BEFORE UPDATE ON loans FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── loan_payments table ──────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE loan_payments (
        id               UUID                       NOT NULL DEFAULT gen_random_uuid(),
        loan_id          UUID                       NOT NULL,
        payment_number   VARCHAR(25)                NOT NULL,
        type             loan_payment_type_enum     NOT NULL DEFAULT 'REGULAR',
        status           loan_payment_status_enum   NOT NULL DEFAULT 'SCHEDULED',
        payment_amount   NUMERIC(20,6)              NOT NULL,
        principal_portion NUMERIC(20,6)             NOT NULL DEFAULT 0,
        interest_portion NUMERIC(20,6)              NOT NULL DEFAULT 0,
        fee_portion      NUMERIC(20,6)              NOT NULL DEFAULT 0,
        balance_after    NUMERIC(20,6),
        due_date         DATE                       NOT NULL,
        paid_at          TIMESTAMPTZ,
        journal_id       UUID,
        sequence_number  INT                        NOT NULL,
        created_at       TIMESTAMPTZ                NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_loan_payments PRIMARY KEY (id),
        CONSTRAINT uq_loan_payments_number UNIQUE (payment_number),
        CONSTRAINT fk_loan_payments_loan FOREIGN KEY (loan_id) REFERENCES loans (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_loan_payments_loan_id ON loan_payments (loan_id)`);

    // ─── cards table ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE cards (
        id                    UUID               NOT NULL DEFAULT gen_random_uuid(),
        customer_id           UUID               NOT NULL,
        account_id            UUID               NOT NULL,
        type                  card_type_enum     NOT NULL,
        status                card_status_enum   NOT NULL DEFAULT 'PENDING',
        network               card_network_enum  NOT NULL DEFAULT 'VISA',
        stripe_card_id        VARCHAR(100)       UNIQUE,
        last_four             CHAR(4)            NOT NULL,
        card_holder_name      VARCHAR(200)       NOT NULL,
        expiry_month          SMALLINT           NOT NULL,
        expiry_year           SMALLINT           NOT NULL,
        spending_limit_daily  NUMERIC(20,6),
        spending_limit_monthly NUMERIC(20,6),
        credit_limit          NUMERIC(20,6),
        available_credit      NUMERIC(20,6),
        statement_balance     NUMERIC(20,6)      NOT NULL DEFAULT 0,
        minimum_payment_due   NUMERIC(20,6)      NOT NULL DEFAULT 0,
        payment_due_date      DATE,
        apr                   NUMERIC(8,6),
        pin_set               BOOLEAN            NOT NULL DEFAULT false,
        virtual_only          BOOLEAN            NOT NULL DEFAULT false,
        international_enabled BOOLEAN            NOT NULL DEFAULT false,
        contactless_enabled   BOOLEAN            NOT NULL DEFAULT true,
        issued_at             TIMESTAMPTZ,
        cancelled_at          TIMESTAMPTZ,
        created_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_cards PRIMARY KEY (id),
        CONSTRAINT fk_cards_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
        CONSTRAINT fk_cards_account FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_cards_customer_id ON cards (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_cards_account_id ON cards (account_id)`);
    await queryRunner.query(`CREATE TRIGGER trg_cards_updated_at
      BEFORE UPDATE ON cards FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── card_transactions table ──────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE card_transactions (
        id                       UUID               NOT NULL DEFAULT gen_random_uuid(),
        card_id                  UUID               NOT NULL,
        account_id               UUID               NOT NULL,
        stripe_authorization_id  VARCHAR(100),
        stripe_transaction_id    VARCHAR(100),
        type                     card_txn_type_enum  NOT NULL,
        status                   card_txn_status_enum NOT NULL DEFAULT 'PENDING',
        amount                   NUMERIC(20,6)      NOT NULL,
        currency                 VARCHAR(3)         NOT NULL DEFAULT 'USD',
        merchant_name            VARCHAR(200),
        merchant_category        VARCHAR(10),
        decline_reason           VARCHAR(200),
        journal_id               UUID,
        authorized_at            TIMESTAMPTZ,
        cleared_at               TIMESTAMPTZ,
        created_at               TIMESTAMPTZ        NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_card_transactions PRIMARY KEY (id),
        CONSTRAINT fk_card_txns_card FOREIGN KEY (card_id) REFERENCES cards (id),
        CONSTRAINT fk_card_txns_account FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_card_txns_card_id ON card_transactions (card_id)`);
    await queryRunner.query(`CREATE INDEX idx_card_txns_account_id ON card_transactions (account_id)`);

    // ─── ach_payments table ───────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE ach_payments (
        id                          UUID              NOT NULL DEFAULT gen_random_uuid(),
        payment_reference           VARCHAR(30)       NOT NULL,
        account_id                  UUID              NOT NULL,
        customer_id                 UUID              NOT NULL,
        direction                   ach_direction_enum NOT NULL,
        status                      ach_status_enum   NOT NULL DEFAULT 'PENDING',
        amount                      NUMERIC(20,6)     NOT NULL,
        currency                    VARCHAR(3)        NOT NULL DEFAULT 'USD',
        description                 VARCHAR(500),
        plaid_payment_id            VARCHAR(100),
        plaid_access_token_ref      VARCHAR(200),
        routing_number              VARCHAR(9),
        external_account_last4      VARCHAR(4),
        external_account_holder_name VARCHAR(200),
        return_code                 VARCHAR(10),
        return_reason               VARCHAR(200),
        journal_id                  UUID,
        idempotency_key             VARCHAR(128)      NOT NULL,
        estimated_completion        TIMESTAMPTZ,
        completed_at                TIMESTAMPTZ,
        created_at                  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_ach_payments PRIMARY KEY (id),
        CONSTRAINT uq_ach_payment_reference UNIQUE (payment_reference),
        CONSTRAINT uq_ach_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT fk_ach_account FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ach_payments_account_id ON ach_payments (account_id)`);
    await queryRunner.query(`CREATE TRIGGER trg_ach_updated_at
      BEFORE UPDATE ON ach_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── wire_transfers table ─────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE wire_transfers (
        id                        UUID              NOT NULL DEFAULT gen_random_uuid(),
        wire_reference            VARCHAR(30)       NOT NULL,
        account_id                UUID              NOT NULL,
        customer_id               UUID              NOT NULL,
        type                      wire_type_enum    NOT NULL,
        status                    wire_status_enum  NOT NULL DEFAULT 'PENDING_APPROVAL',
        amount                    NUMERIC(20,6)     NOT NULL,
        currency                  VARCHAR(3)        NOT NULL,
        usd_equivalent            NUMERIC(20,6),
        beneficiary_name          VARCHAR(200)      NOT NULL,
        beneficiary_account_number VARCHAR(50)      NOT NULL,
        beneficiary_routing_number VARCHAR(11),
        beneficiary_swift_bic     VARCHAR(11),
        beneficiary_bank_name     VARCHAR(200),
        beneficiary_bank_address  VARCHAR(500),
        beneficiary_address       VARCHAR(500),
        beneficiary_country       VARCHAR(3),
        iban                      VARCHAR(34),
        intermediary_swift_bic    VARCHAR(11),
        intermediary_bank_name    VARCHAR(200),
        payment_purpose           VARCHAR(500),
        wire_fee                  NUMERIC(20,6)     NOT NULL DEFAULT 25,
        idempotency_key           VARCHAR(128)      NOT NULL,
        journal_id                UUID,
        approved_by_user_id       UUID,
        approved_at               TIMESTAMPTZ,
        submitted_at              TIMESTAMPTZ,
        completed_at              TIMESTAMPTZ,
        failure_reason            VARCHAR(500),
        created_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ       NOT NULL DEFAULT NOW(),

        CONSTRAINT pk_wire_transfers PRIMARY KEY (id),
        CONSTRAINT uq_wire_reference UNIQUE (wire_reference),
        CONSTRAINT uq_wire_idempotency_key UNIQUE (idempotency_key),
        CONSTRAINT fk_wire_account FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_wire_transfers_account_id ON wire_transfers (account_id)`);
    await queryRunner.query(`CREATE TRIGGER trg_wire_updated_at
      BEFORE UPDATE ON wire_transfers FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_wire_updated_at ON wire_transfers`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_ach_updated_at ON ach_payments`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_cards_updated_at ON cards`);
    await queryRunner.query(`DROP TRIGGER IF EXISTS trg_loans_updated_at ON loans`);
    await queryRunner.query(`DROP TABLE IF EXISTS wire_transfers`);
    await queryRunner.query(`DROP TABLE IF EXISTS ach_payments`);
    await queryRunner.query(`DROP TABLE IF EXISTS card_transactions`);
    await queryRunner.query(`DROP TABLE IF EXISTS cards`);
    await queryRunner.query(`DROP TABLE IF EXISTS loan_payments`);
    await queryRunner.query(`DROP TABLE IF EXISTS loans`);
    await queryRunner.query(`DROP TYPE IF EXISTS wire_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS wire_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS ach_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS ach_direction_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS card_txn_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS card_txn_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS card_network_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS card_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS card_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS loan_payment_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS loan_payment_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS amortization_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS loan_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS loan_type_enum`);
  }
}
