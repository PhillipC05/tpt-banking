import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 4 schema: Real-Time Payments (RTP/FedNow, SEPA SCT Inst)
 * and Open Banking (client registry, consent grants).
 */
export class Phase4RealtimeOpenBanking1700000004000 implements MigrationInterface {
  name = 'Phase4RealtimeOpenBanking1700000004000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE rtp_rail_enum AS ENUM ('TCH_RTP','FED_NOW')`);
    await queryRunner.query(`CREATE TYPE rtp_status_enum AS ENUM ('PENDING','ACCEPTED','PROCESSING','COMPLETED','FAILED','REJECTED','RETURNED')`);
    await queryRunner.query(`CREATE TYPE rtp_direction_enum AS ENUM ('CREDIT_PUSH','REQUEST_FOR_PAYMENT')`);
    await queryRunner.query(`CREATE TYPE sepa_scheme_enum AS ENUM ('SCT','SCT_INST','SDD_CORE')`);
    await queryRunner.query(`CREATE TYPE sepa_status_enum AS ENUM ('PENDING','ACCEPTED','PROCESSING','COMPLETED','REJECTED','RETURNED','FAILED')`);
    await queryRunner.query(`CREATE TYPE ob_standard_enum AS ENUM ('UK_OBIE','PSD2_BERLIN','FDX','GENERIC_OAUTH2')`);
    await queryRunner.query(`CREATE TYPE tpp_type_enum AS ENUM ('AISP','PISP','CBPII','ASPSP')`);
    await queryRunner.query(`CREATE TYPE client_status_enum AS ENUM ('PENDING','ACTIVE','SUSPENDED','REVOKED')`);
    await queryRunner.query(`CREATE TYPE consent_status_enum AS ENUM ('AWAITING_AUTHORISATION','AUTHORISED','REJECTED','REVOKED','EXPIRED')`);
    await queryRunner.query(`CREATE TYPE consent_type_enum AS ENUM ('ACCOUNT_ACCESS','DOMESTIC_PAYMENT','INTERNATIONAL_PAYMENT','BULK_PAYMENT','STANDING_ORDER')`);

    // ─── rtp_payments ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE rtp_payments (
        id                      UUID              NOT NULL DEFAULT gen_random_uuid(),
        payment_reference       VARCHAR(35)       NOT NULL,
        account_id              UUID              NOT NULL,
        customer_id             UUID              NOT NULL,
        rail                    rtp_rail_enum     NOT NULL,
        direction               rtp_direction_enum NOT NULL DEFAULT 'CREDIT_PUSH',
        status                  rtp_status_enum   NOT NULL DEFAULT 'PENDING',
        amount                  NUMERIC(20,2)     NOT NULL,
        currency                VARCHAR(3)        NOT NULL DEFAULT 'USD',
        creditor_name           VARCHAR(200)      NOT NULL,
        creditor_account_number VARCHAR(34)       NOT NULL,
        creditor_routing_number VARCHAR(9)        NOT NULL,
        creditor_bank_name      VARCHAR(200),
        end_to_end_id           VARCHAR(35)       NOT NULL,
        remittance_info         VARCHAR(140),
        purpose_code            VARCHAR(4),
        network_transaction_id  VARCHAR(100),
        rejection_reason_code   VARCHAR(10),
        rejection_reason        VARCHAR(500),
        journal_id              UUID,
        idempotency_key         VARCHAR(128)      NOT NULL,
        submitted_at            TIMESTAMPTZ,
        settled_at              TIMESTAMPTZ,
        created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_rtp_payments PRIMARY KEY (id),
        CONSTRAINT uq_rtp_reference UNIQUE (payment_reference),
        CONSTRAINT uq_rtp_idempotency UNIQUE (idempotency_key),
        CONSTRAINT ck_rtp_tch_limit CHECK (
          rail != 'TCH_RTP' OR amount <= 1000000
        ),
        CONSTRAINT ck_rtp_fednow_limit CHECK (
          rail != 'FED_NOW' OR amount <= 1000000
        ),
        CONSTRAINT fk_rtp_account FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_rtp_account ON rtp_payments (account_id)`);
    await queryRunner.query(`CREATE INDEX idx_rtp_status ON rtp_payments (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_rtp_updated_at BEFORE UPDATE ON rtp_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── sepa_payments ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE sepa_payments (
        id                      UUID              NOT NULL DEFAULT gen_random_uuid(),
        payment_reference       VARCHAR(35)       NOT NULL,
        account_id              UUID              NOT NULL,
        customer_id             UUID              NOT NULL,
        scheme                  sepa_scheme_enum  NOT NULL,
        status                  sepa_status_enum  NOT NULL DEFAULT 'PENDING',
        amount                  NUMERIC(20,2)     NOT NULL,
        currency                VARCHAR(3)        NOT NULL DEFAULT 'EUR',
        debtor_name             VARCHAR(200)      NOT NULL,
        debtor_iban             VARCHAR(34)       NOT NULL,
        debtor_bic              VARCHAR(11),
        creditor_name           VARCHAR(200)      NOT NULL,
        creditor_iban           VARCHAR(34)       NOT NULL,
        creditor_bic            VARCHAR(11),
        creditor_bank_name      VARCHAR(200),
        creditor_address        VARCHAR(500),
        creditor_country        VARCHAR(2),
        end_to_end_id           VARCHAR(35)       NOT NULL,
        remittance_info         VARCHAR(140),
        purpose_code            VARCHAR(4),
        category_purpose        VARCHAR(4),
        network_transaction_id  VARCHAR(100),
        rejection_reason_code   VARCHAR(10),
        rejection_reason        VARCHAR(500),
        journal_id              UUID,
        idempotency_key         VARCHAR(128)      NOT NULL,
        execution_date          DATE,
        submitted_at            TIMESTAMPTZ,
        settled_at              TIMESTAMPTZ,
        created_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at              TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_sepa_payments PRIMARY KEY (id),
        CONSTRAINT uq_sepa_reference UNIQUE (payment_reference),
        CONSTRAINT uq_sepa_idempotency UNIQUE (idempotency_key),
        CONSTRAINT ck_sepa_inst_limit CHECK (
          scheme != 'SCT_INST' OR amount <= 100000
        ),
        CONSTRAINT fk_sepa_account FOREIGN KEY (account_id) REFERENCES accounts (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_sepa_account ON sepa_payments (account_id)`);
    await queryRunner.query(`CREATE INDEX idx_sepa_status ON sepa_payments (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_sepa_updated_at BEFORE UPDATE ON sepa_payments FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── open_banking_clients ──────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE open_banking_clients (
        id                          UUID                  NOT NULL DEFAULT gen_random_uuid(),
        client_id                   VARCHAR(100)          NOT NULL,
        client_secret_hash          VARCHAR(200),
        client_name                 VARCHAR(200)          NOT NULL,
        client_description          VARCHAR(500),
        standard                    ob_standard_enum      NOT NULL,
        tpp_types                   TEXT                  NOT NULL,
        status                      client_status_enum    NOT NULL DEFAULT 'PENDING',
        redirect_uris               TEXT[]                NOT NULL,
        grant_types                 TEXT                  NOT NULL DEFAULT 'authorization_code',
        response_types              TEXT                  NOT NULL DEFAULT 'code',
        allowed_scopes              TEXT                  NOT NULL,
        regulatory_registration_id  VARCHAR(100),
        certificate_reference       VARCHAR(200),
        logo_uri                    VARCHAR(500),
        tos_uri                     VARCHAR(500),
        policy_uri                  VARCHAR(500),
        jwks_uri                    VARCHAR(500),
        access_token_ttl            INT                   NOT NULL DEFAULT 3600,
        refresh_token_ttl           INT                   NOT NULL DEFAULT 604800,
        created_at                  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        updated_at                  TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ob_clients PRIMARY KEY (id),
        CONSTRAINT uq_ob_client_id UNIQUE (client_id)
      )
    `);
    await queryRunner.query(`CREATE TRIGGER trg_ob_clients_updated_at BEFORE UPDATE ON open_banking_clients FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── open_banking_consents ─────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE open_banking_consents (
        id                            UUID                    NOT NULL DEFAULT gen_random_uuid(),
        consent_id                    VARCHAR(100)            NOT NULL,
        client_id                     VARCHAR(100)            NOT NULL,
        customer_id                   UUID,
        type                          consent_type_enum       NOT NULL,
        status                        consent_status_enum     NOT NULL DEFAULT 'AWAITING_AUTHORISATION',
        permissions                   TEXT                    NOT NULL,
        authorised_account_ids        UUID[]                  NOT NULL DEFAULT '{}',
        expires_at                    TIMESTAMPTZ,
        transaction_from_date         TIMESTAMPTZ,
        transaction_to_date           TIMESTAMPTZ,
        payment_details               JSONB,
        code_challenge                VARCHAR(200),
        code_challenge_method         VARCHAR(10),
        state                         VARCHAR(200),
        authorization_code            VARCHAR(200),
        authorization_code_expires_at TIMESTAMPTZ,
        redirect_uri                  VARCHAR(500),
        authorised_at                 TIMESTAMPTZ,
        revoked_at                    TIMESTAMPTZ,
        risk_data                     JSONB,
        created_at                    TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at                    TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ob_consents PRIMARY KEY (id),
        CONSTRAINT uq_ob_consent_id UNIQUE (consent_id),
        CONSTRAINT fk_ob_consent_client FOREIGN KEY (client_id) REFERENCES open_banking_clients (client_id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ob_consent_client ON open_banking_consents (client_id)`);
    await queryRunner.query(`CREATE INDEX idx_ob_consent_customer ON open_banking_consents (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_ob_consent_status ON open_banking_consents (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_ob_consents_updated_at BEFORE UPDATE ON open_banking_consents FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['open_banking_consents','open_banking_clients','sepa_payments','rtp_payments']) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${t.replace('open_banking_','ob_').replace('rtp_payments','rtp').replace('sepa_payments','sepa')}_updated_at ON ${t}`);
      await queryRunner.query(`DROP TABLE IF EXISTS ${t}`);
    }
    for (const e of ['consent_type_enum','consent_status_enum','client_status_enum','tpp_type_enum','ob_standard_enum','sepa_status_enum','sepa_scheme_enum','rtp_direction_enum','rtp_status_enum','rtp_rail_enum']) {
      await queryRunner.query(`DROP TYPE IF EXISTS ${e}`);
    }
  }
}
