import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 schema: KYC verifications, sanctions screening, AML alerts,
 * compliance cases, SARs, and CTRs.
 */
export class Phase3ComplianceSchema1700000003000 implements MigrationInterface {
  name = 'Phase3ComplianceSchema1700000003000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE kyc_provider_enum AS ENUM ('JUMIO','ONFIDO','MANUAL')
    `);
    await queryRunner.query(`
      CREATE TYPE kyc_verification_status_enum AS ENUM (
        'INITIATED','PENDING','APPROVED','DECLINED','EXPIRED','REVIEW_REQUIRED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE kyc_document_type_enum AS ENUM (
        'PASSPORT','DRIVERS_LICENSE','NATIONAL_ID','RESIDENCE_PERMIT'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE screening_type_enum AS ENUM (
        'SANCTIONS','PEP','ADVERSE_MEDIA','WATCHLIST'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE screening_status_enum AS ENUM (
        'PENDING','CLEAR','HIT','CONFIRMED_MATCH','FALSE_POSITIVE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE screening_trigger_enum AS ENUM (
        'ONBOARDING','PERIODIC_REFRESH','TRANSACTION','MANUAL','NAME_CHANGE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE aml_alert_status_enum AS ENUM (
        'OPEN','UNDER_REVIEW','ESCALATED',
        'CLOSED_NO_ACTION','CLOSED_SAR_FILED','CLOSED_FALSE_POSITIVE'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE aml_alert_severity_enum AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL')
    `);
    await queryRunner.query(`
      CREATE TYPE aml_rule_code_enum AS ENUM (
        'STRUCTURING_CASH','STRUCTURING_TRANSFERS','HIGH_VELOCITY_TRANSFERS',
        'RAPID_MOVEMENT','LARGE_CASH_DEPOSIT','LARGE_WIRE_TRANSFER','CTR_THRESHOLD',
        'HIGH_RISK_JURISDICTION','SANCTIONS_COUNTRY','UNUSUAL_ACTIVITY',
        'DORMANT_ACCOUNT_ACTIVITY','ROUND_DOLLAR_TRANSACTIONS'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE case_type_enum AS ENUM ('AML','FRAUD','KYC','SANCTIONS','GENERAL')
    `);
    await queryRunner.query(`
      CREATE TYPE case_status_enum AS ENUM (
        'OPEN','UNDER_INVESTIGATION','PENDING_ESCALATION',
        'SAR_FILED','CLOSED_NO_ACTION','CLOSED_ACTION_TAKEN'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE case_priority_enum AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL')
    `);
    await queryRunner.query(`
      CREATE TYPE sar_status_enum AS ENUM (
        'DRAFT','PENDING_APPROVAL','APPROVED','FILED','ACKNOWLEDGED','REJECTED'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE sar_activity_type_enum AS ENUM (
        'STRUCTURING','MONEY_LAUNDERING','TERRORIST_FINANCING','FRAUD',
        'IDENTITY_THEFT','BRIBERY','CYBER_EVENT','MORTGAGE_FRAUD',
        'WIRE_TRANSFER_FRAUD','OTHER'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE ctr_status_enum AS ENUM ('PENDING','FILED','ACKNOWLEDGED','AMENDED')
    `);

    // ─── kyc_verifications ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE kyc_verifications (
        id                    UUID                           NOT NULL DEFAULT gen_random_uuid(),
        customer_id           UUID                           NOT NULL,
        provider              kyc_provider_enum              NOT NULL,
        status                kyc_verification_status_enum   NOT NULL DEFAULT 'INITIATED',
        provider_reference    VARCHAR(200),
        redirect_url          TEXT,
        document_type         kyc_document_type_enum,
        document_country      VARCHAR(3),
        document_number_hash  VARCHAR(200),
        provider_decision     VARCHAR(50),
        rejection_reasons     JSONB,
        provider_response     JSONB,
        reviewed_by_user_id   UUID,
        reviewed_at           TIMESTAMPTZ,
        reviewer_notes        TEXT,
        expires_at            TIMESTAMPTZ,
        completed_at          TIMESTAMPTZ,
        created_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_kyc_verifications PRIMARY KEY (id),
        CONSTRAINT fk_kyc_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_kyc_customer_id ON kyc_verifications (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_kyc_status ON kyc_verifications (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_kyc_updated_at
      BEFORE UPDATE ON kyc_verifications FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── screening_results ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE screening_results (
        id                   UUID                      NOT NULL DEFAULT gen_random_uuid(),
        customer_id          UUID                      NOT NULL,
        type                 screening_type_enum       NOT NULL,
        status               screening_status_enum     NOT NULL DEFAULT 'PENDING',
        trigger              screening_trigger_enum    NOT NULL,
        provider_search_id   VARCHAR(100),
        risk_score           NUMERIC(5,2),
        match_count          INT                       NOT NULL DEFAULT 0,
        matches              JSONB,
        provider_response    JSONB,
        reviewed_by_user_id  UUID,
        reviewed_at          TIMESTAMPTZ,
        reviewer_notes       TEXT,
        next_screen_at       TIMESTAMPTZ,
        created_at           TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_screening_results PRIMARY KEY (id),
        CONSTRAINT fk_screening_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_screening_customer_id ON screening_results (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_screening_status ON screening_results (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_screening_updated_at
      BEFORE UPDATE ON screening_results FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── aml_alerts ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE aml_alerts (
        id                   UUID                      NOT NULL DEFAULT gen_random_uuid(),
        alert_number         VARCHAR(25)               NOT NULL,
        customer_id          UUID                      NOT NULL,
        account_id           UUID,
        transaction_id       UUID,
        rule_code            aml_rule_code_enum        NOT NULL,
        severity             aml_alert_severity_enum   NOT NULL,
        status               aml_alert_status_enum     NOT NULL DEFAULT 'OPEN',
        description          TEXT                      NOT NULL,
        trigger_data         JSONB                     NOT NULL,
        risk_score           INT                       NOT NULL DEFAULT 0,
        assigned_to_user_id  UUID,
        assigned_at          TIMESTAMPTZ,
        reviewed_by_user_id  UUID,
        reviewed_at          TIMESTAMPTZ,
        reviewer_notes       TEXT,
        case_id              UUID,
        due_date             TIMESTAMPTZ,
        created_at           TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_aml_alerts PRIMARY KEY (id),
        CONSTRAINT uq_aml_alert_number UNIQUE (alert_number),
        CONSTRAINT fk_aml_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_aml_alerts_customer_id ON aml_alerts (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_aml_alerts_status ON aml_alerts (status)`);
    await queryRunner.query(`CREATE INDEX idx_aml_alerts_severity ON aml_alerts (severity)`);
    await queryRunner.query(`CREATE TRIGGER trg_aml_updated_at
      BEFORE UPDATE ON aml_alerts FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── compliance_cases ─────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE compliance_cases (
        id                   UUID                  NOT NULL DEFAULT gen_random_uuid(),
        case_number          VARCHAR(25)           NOT NULL,
        customer_id          UUID                  NOT NULL,
        type                 case_type_enum        NOT NULL,
        status               case_status_enum      NOT NULL DEFAULT 'OPEN',
        priority             case_priority_enum    NOT NULL DEFAULT 'MEDIUM',
        subject              VARCHAR(500)          NOT NULL,
        description          TEXT,
        assigned_to_user_id  UUID,
        alert_ids            UUID[]                NOT NULL DEFAULT '{}',
        sar_id               UUID,
        notes                JSONB                 NOT NULL DEFAULT '[]',
        due_date             TIMESTAMPTZ,
        closed_at            TIMESTAMPTZ,
        closed_by_user_id    UUID,
        closure_reason       TEXT,
        created_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        updated_at           TIMESTAMPTZ           NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_compliance_cases PRIMARY KEY (id),
        CONSTRAINT uq_case_number UNIQUE (case_number),
        CONSTRAINT fk_case_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_cases_customer_id ON compliance_cases (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_cases_status ON compliance_cases (status)`);
    await queryRunner.query(`CREATE TRIGGER trg_cases_updated_at
      BEFORE UPDATE ON compliance_cases FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── sars ─────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE sars (
        id                         UUID                     NOT NULL DEFAULT gen_random_uuid(),
        sar_number                 VARCHAR(25)              NOT NULL,
        customer_id                UUID                     NOT NULL,
        case_id                    UUID,
        status                     sar_status_enum          NOT NULL DEFAULT 'DRAFT',
        activity_type              sar_activity_type_enum   NOT NULL,
        suspicious_amount          NUMERIC(20,2)            NOT NULL,
        activity_from              DATE                     NOT NULL,
        activity_to                DATE                     NOT NULL,
        narrative                  TEXT                     NOT NULL,
        related_transaction_ids    UUID[]                   NOT NULL DEFAULT '{}',
        related_account_ids        UUID[]                   NOT NULL DEFAULT '{}',
        subject_info               JSONB,
        law_enforcement_contact    JSONB,
        prepared_by_user_id        UUID                     NOT NULL,
        first_approval_user_id     UUID,
        first_approved_at          TIMESTAMPTZ,
        second_approval_user_id    UUID,
        second_approved_at         TIMESTAMPTZ,
        fincen_bsa_id              VARCHAR(50),
        filed_at                   TIMESTAMPTZ,
        acknowledged_at            TIMESTAMPTZ,
        deadline                   TIMESTAMPTZ              NOT NULL,
        created_at                 TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
        updated_at                 TIMESTAMPTZ              NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_sars PRIMARY KEY (id),
        CONSTRAINT uq_sar_number UNIQUE (sar_number),
        CONSTRAINT fk_sar_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_sars_customer_id ON sars (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_sars_status ON sars (status)`);
    await queryRunner.query(`CREATE INDEX idx_sars_deadline ON sars (deadline)`);
    await queryRunner.query(`CREATE TRIGGER trg_sars_updated_at
      BEFORE UPDATE ON sars FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── ctrs ─────────────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE ctrs (
        id                  UUID              NOT NULL DEFAULT gen_random_uuid(),
        ctr_number          VARCHAR(25)       NOT NULL,
        customer_id         UUID              NOT NULL,
        account_id          UUID              NOT NULL,
        transaction_id      UUID,
        status              ctr_status_enum   NOT NULL DEFAULT 'PENDING',
        cash_amount         NUMERIC(20,2)     NOT NULL,
        transaction_date    DATE              NOT NULL,
        transaction_type    VARCHAR(20)       NOT NULL,
        conductor_info      JSONB             NOT NULL,
        beneficiary_info    JSONB,
        fincen_bsa_id       VARCHAR(50),
        filed_at            TIMESTAMPTZ,
        acknowledged_at     TIMESTAMPTZ,
        deadline            TIMESTAMPTZ       NOT NULL,
        filed_by_user_id    UUID,
        created_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ       NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_ctrs PRIMARY KEY (id),
        CONSTRAINT uq_ctr_number UNIQUE (ctr_number),
        CONSTRAINT fk_ctr_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
        CONSTRAINT ck_ctr_amount CHECK (cash_amount > 10000)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_ctrs_customer_id ON ctrs (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_ctrs_deadline ON ctrs (deadline)`);
    await queryRunner.query(`CREATE TRIGGER trg_ctrs_updated_at
      BEFORE UPDATE ON ctrs FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of ['ctrs','sars','compliance_cases','aml_alerts','screening_results','kyc_verifications']) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${table.replace('compliance_','').replace('_','')}_updated_at ON ${table}`);
    }
    for (const table of ['ctrs','sars','compliance_cases','aml_alerts','screening_results','kyc_verifications']) {
      await queryRunner.query(`DROP TABLE IF EXISTS ${table}`);
    }
    for (const t of ['ctr_status_enum','sar_activity_type_enum','sar_status_enum','case_priority_enum','case_status_enum','case_type_enum','aml_rule_code_enum','aml_alert_severity_enum','aml_alert_status_enum','screening_trigger_enum','screening_status_enum','screening_type_enum','kyc_document_type_enum','kyc_verification_status_enum','kyc_provider_enum']) {
      await queryRunner.query(`DROP TYPE IF EXISTS ${t}`);
    }
  }
}
