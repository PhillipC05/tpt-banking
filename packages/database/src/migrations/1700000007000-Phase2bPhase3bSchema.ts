import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2b / 3b schema additions:
 *  - collection_cases + workout_plans (delinquency tracking)
 *  - card_disputes (Stripe dispute management)
 *  - cdd_assessments (Customer Due Diligence with risk rating)
 *  - edd_questionnaires (Enhanced Due Diligence for HNW/VIP)
 */
export class Phase2bPhase3bSchema1700000007000 implements MigrationInterface {
  name = 'Phase2bPhase3bSchema1700000007000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enum types ──────────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TYPE collection_case_status_enum AS ENUM (
        'OPEN','IN_WORKOUT','RESOLVED','CHARGED_OFF','LEGAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE workout_plan_type_enum AS ENUM (
        'FORBEARANCE','DEFERMENT','LOAN_MODIFICATION','REPAYMENT_PLAN','SETTLEMENT'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE workout_plan_status_enum AS ENUM (
        'PROPOSED','ACTIVE','COMPLETED','DEFAULTED','CANCELLED'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE dispute_reason_enum AS ENUM (
        'FRAUDULENT','UNRECOGNIZED','DUPLICATE','PRODUCT_NOT_RECEIVED',
        'PRODUCT_UNACCEPTABLE','CREDIT_NOT_PROCESSED','SUBSCRIPTION_CANCELED','GENERAL'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE dispute_status_enum AS ENUM (
        'WARNING_NEEDS_RESPONSE','WARNING_UNDER_REVIEW','WARNING_CLOSED',
        'NEEDS_RESPONSE','UNDER_REVIEW','CHARGE_REFUNDED','WON','LOST'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE cdd_risk_rating_enum AS ENUM ('LOW','MEDIUM','HIGH','VERY_HIGH')
    `);

    await queryRunner.query(`
      CREATE TYPE cdd_source_of_funds_enum AS ENUM (
        'EMPLOYMENT','BUSINESS_INCOME','INVESTMENTS','INHERITANCE',
        'PENSION','GIFT','GOVERNMENT_BENEFITS','OTHER'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE cdd_status_enum AS ENUM ('PENDING','COMPLETED','REQUIRES_EDD','EXPIRED')
    `);

    await queryRunner.query(`
      CREATE TYPE edd_status_enum AS ENUM (
        'INITIATED','PENDING_CUSTOMER','PENDING_REVIEW',
        'PENDING_MANAGER_APPROVAL','APPROVED','DECLINED','EXPIRED'
      )
    `);

    // ─── collection_cases ────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE collection_cases (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        loan_id           UUID NOT NULL,
        customer_id       UUID NOT NULL,
        status            collection_case_status_enum NOT NULL DEFAULT 'OPEN',
        days_overdue      INT NOT NULL DEFAULT 0,
        amount_overdue    NUMERIC(20,6) NOT NULL DEFAULT 0,
        currency          CHAR(3) NOT NULL DEFAULT 'USD',
        missed_payments   INT NOT NULL DEFAULT 0,
        collector_id      UUID,
        notes             TEXT,
        resolved_at       TIMESTAMPTZ,
        charged_off_at    TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_collection_cases_loan_id     ON collection_cases (loan_id)`);
    await queryRunner.query(`CREATE INDEX idx_collection_cases_customer_id ON collection_cases (customer_id)`);

    // ─── workout_plans ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE workout_plans (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        collection_case_id    UUID NOT NULL REFERENCES collection_cases (id),
        type                  workout_plan_type_enum NOT NULL,
        status                workout_plan_status_enum NOT NULL DEFAULT 'PROPOSED',
        reduced_payment_amount NUMERIC(20,6),
        start_date            DATE,
        end_date              DATE,
        terms                 JSONB,
        approved_by_user_id   UUID,
        approved_at           TIMESTAMPTZ,
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_workout_plans_case_id ON workout_plans (collection_case_id)`);

    // ─── card_disputes ───────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE card_disputes (
        id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        stripe_dispute_id VARCHAR(100) NOT NULL UNIQUE,
        card_id           UUID,
        stripe_charge_id  VARCHAR(100),
        amount            NUMERIC(20,6) NOT NULL,
        currency          CHAR(3) NOT NULL DEFAULT 'USD',
        reason            dispute_reason_enum NOT NULL,
        status            dispute_status_enum NOT NULL,
        respond_by        TIMESTAMPTZ,
        evidence          JSONB,
        stripe_metadata   JSONB,
        resolved_at       TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX idx_card_disputes_stripe_dispute_id ON card_disputes (stripe_dispute_id)`);
    await queryRunner.query(`CREATE INDEX idx_card_disputes_card_id ON card_disputes (card_id)`);

    // ─── cdd_assessments ─────────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE cdd_assessments (
        id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id           UUID NOT NULL,
        status                cdd_status_enum NOT NULL DEFAULT 'PENDING',
        risk_rating           cdd_risk_rating_enum,
        risk_score            INT,
        source_of_funds       cdd_source_of_funds_enum,
        source_of_wealth      TEXT,
        business_nature       VARCHAR(500),
        beneficial_owners     JSONB,
        politically_exposed   BOOLEAN NOT NULL DEFAULT FALSE,
        adverse_media_hits    JSONB,
        reviewed_by_user_id   UUID,
        reviewed_at           TIMESTAMPTZ,
        next_review_date      DATE,
        notes                 TEXT,
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_cdd_assessments_customer_id ON cdd_assessments (customer_id)`);

    // ─── edd_questionnaires ──────────────────────────────────────────────────

    await queryRunner.query(`
      CREATE TABLE edd_questionnaires (
        id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        customer_id               UUID NOT NULL,
        cdd_assessment_id         UUID REFERENCES cdd_assessments (id),
        status                    edd_status_enum NOT NULL DEFAULT 'INITIATED',
        questionnaire_data        JSONB,
        pep_details               JSONB,
        adverse_media_details     JSONB,
        senior_manager_approval   JSONB,
        approved_by_user_id       UUID,
        approved_at               TIMESTAMPTZ,
        next_review_date          DATE,
        expires_at                TIMESTAMPTZ,
        notes                     TEXT,
        created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await queryRunner.query(`CREATE INDEX idx_edd_questionnaires_customer_id ON edd_questionnaires (customer_id)`);
    await queryRunner.query(`CREATE INDEX idx_edd_questionnaires_cdd_id      ON edd_questionnaires (cdd_assessment_id)`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS edd_questionnaires`);
    await queryRunner.query(`DROP TABLE IF EXISTS cdd_assessments`);
    await queryRunner.query(`DROP TABLE IF EXISTS card_disputes`);
    await queryRunner.query(`DROP TABLE IF EXISTS workout_plans`);
    await queryRunner.query(`DROP TABLE IF EXISTS collection_cases`);

    await queryRunner.query(`DROP TYPE IF EXISTS edd_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS cdd_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS cdd_source_of_funds_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS cdd_risk_rating_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS dispute_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS dispute_reason_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS workout_plan_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS workout_plan_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS collection_case_status_enum`);
  }
}
