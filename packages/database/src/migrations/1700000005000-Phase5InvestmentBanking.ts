import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 5 schema: Investment Banking — Instruments, Orders (FIX), Executions, Positions, Portfolios.
 */
export class Phase5InvestmentBanking1700000005000 implements MigrationInterface {
  name = 'Phase5InvestmentBanking1700000005000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ─── Enums ────────────────────────────────────────────────────────────────
    await queryRunner.query(`CREATE TYPE asset_class_enum AS ENUM ('EQUITY','FIXED_INCOME','DERIVATIVE','FX','COMMODITY','CRYPTO','FUND','MONEY_MARKET')`);
    await queryRunner.query(`CREATE TYPE instrument_status_enum AS ENUM ('ACTIVE','INACTIVE','DELISTED','SUSPENDED')`);
    await queryRunner.query(`CREATE TYPE derivative_type_enum AS ENUM ('CALL_OPTION','PUT_OPTION','FUTURE','FORWARD','SWAP','SWAPTION','CDS','CLN','WARRANT')`);
    await queryRunner.query(`CREATE TYPE order_side_enum AS ENUM ('BUY','SELL','SELL_SHORT','BUY_MINUS')`);
    await queryRunner.query(`CREATE TYPE order_type_enum AS ENUM ('MARKET','LIMIT','STOP','STOP_LIMIT','MARKET_ON_CLOSE','LIMIT_ON_CLOSE','PEGGED','TWAP','VWAP')`);
    await queryRunner.query(`CREATE TYPE time_in_force_enum AS ENUM ('DAY','GTC','AT_THE_OPEN','IOC','FOK','GTD','AT_THE_CLOSE')`);
    await queryRunner.query(`CREATE TYPE order_status_enum AS ENUM ('PENDING_NEW','NEW','PARTIALLY_FILLED','FILLED','DONE_FOR_DAY','CANCELLED','PENDING_CANCEL','STOPPED','REJECTED','SUSPENDED','PENDING_REPLACE','EXPIRED')`);
    await queryRunner.query(`CREATE TYPE order_capacity_enum AS ENUM ('AGENCY','PRINCIPAL','RISKLESS_PRINCIPAL')`);
    await queryRunner.query(`CREATE TYPE exec_type_enum AS ENUM ('NEW','PARTIAL_FILL','FILL','CANCELLED','REPLACE','PENDING_CANCEL','STOPPED','REJECTED','EXPIRED','TRADE','TRADE_CORRECT','TRADE_CANCEL')`);
    await queryRunner.query(`CREATE TYPE settlement_type_enum AS ENUM ('REGULAR','NEXT_DAY','CASH','FUTURE','SELLER_OPTION','T_PLUS_5')`);
    await queryRunner.query(`CREATE TYPE settlement_status_enum AS ENUM ('PENDING','AFFIRMED','CONFIRMED','SETTLED','FAILED','PARTIAL')`);
    await queryRunner.query(`CREATE TYPE portfolio_type_enum AS ENUM ('PROP_TRADING','CLIENT_MANAGED','HEDGE_FUND','PENSION','ENDOWMENT','FAMILY_OFFICE','SEGREGATED','OMNIBUS')`);
    await queryRunner.query(`CREATE TYPE portfolio_status_enum AS ENUM ('ACTIVE','SUSPENDED','CLOSED')`);
    await queryRunner.query(`CREATE TYPE risk_profile_enum AS ENUM ('CONSERVATIVE','MODERATE','BALANCED','GROWTH','AGGRESSIVE')`);

    // ─── instruments ──────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE instruments (
        id                UUID                      NOT NULL DEFAULT gen_random_uuid(),
        isin              VARCHAR(12)               UNIQUE,
        cusip             VARCHAR(9)                UNIQUE,
        sedol             VARCHAR(7),
        ticker            VARCHAR(20),
        bloomberg_id      VARCHAR(50),
        ric               VARCHAR(30),
        display_name      VARCHAR(200)              NOT NULL,
        long_name         VARCHAR(500),
        asset_class       asset_class_enum          NOT NULL,
        instrument_status instrument_status_enum    NOT NULL DEFAULT 'ACTIVE',
        currency          VARCHAR(3)                NOT NULL,
        exchange          VARCHAR(10),
        country_of_issue  VARCHAR(2),
        sector            VARCHAR(100),
        industry          VARCHAR(100),
        coupon_rate       NUMERIC(8,6),
        maturity_date     DATE,
        face_value        NUMERIC(20,6),
        coupon_frequency  VARCHAR(20),
        credit_rating     VARCHAR(10),
        derivative_type   derivative_type_enum,
        underlying_id     UUID,
        derivative_details JSONB,
        lot_size          NUMERIC(20,6)             NOT NULL DEFAULT 1,
        price_multiplier  NUMERIC(10,4)             NOT NULL DEFAULT 1,
        last_price        NUMERIC(20,6),
        price_updated_at  TIMESTAMPTZ,
        created_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_instruments PRIMARY KEY (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_instrument_ticker ON instruments (ticker)`);
    await queryRunner.query(`CREATE INDEX idx_instrument_asset_class ON instruments (asset_class)`);
    await queryRunner.query(`CREATE INDEX idx_instrument_exchange ON instruments (exchange)`);
    await queryRunner.query(`CREATE TRIGGER trg_instruments_updated_at BEFORE UPDATE ON instruments FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── portfolios ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE portfolios (
        id                    UUID                    NOT NULL DEFAULT gen_random_uuid(),
        portfolio_code        VARCHAR(30)             NOT NULL,
        display_name          VARCHAR(200)            NOT NULL,
        description           VARCHAR(500),
        type                  portfolio_type_enum     NOT NULL,
        status                portfolio_status_enum   NOT NULL DEFAULT 'ACTIVE',
        risk_profile          risk_profile_enum       NOT NULL DEFAULT 'BALANCED',
        base_currency         VARCHAR(3)              NOT NULL,
        owner_id              UUID,
        manager_id            UUID,
        total_market_value    NUMERIC(20,6)           NOT NULL DEFAULT 0,
        total_unrealized_pnl  NUMERIC(20,6)           NOT NULL DEFAULT 0,
        total_realized_pnl    NUMERIC(20,6)           NOT NULL DEFAULT 0,
        day_pnl               NUMERIC(20,6)           NOT NULL DEFAULT 0,
        cash_balance          NUMERIC(20,6)           NOT NULL DEFAULT 0,
        ips_bounds            JSONB,
        benchmark             VARCHAR(50),
        inception_date        DATE,
        closed_date           DATE,
        last_valued_at        TIMESTAMPTZ,
        created_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_portfolios PRIMARY KEY (id),
        CONSTRAINT uq_portfolio_code UNIQUE (portfolio_code)
      )
    `);
    await queryRunner.query(`CREATE TRIGGER trg_portfolios_updated_at BEFORE UPDATE ON portfolios FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── orders ────────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE orders (
        id                UUID                    NOT NULL DEFAULT gen_random_uuid(),
        cl_ord_id         VARCHAR(50)             NOT NULL,
        ord_id            VARCHAR(100),
        instrument_id     UUID                    NOT NULL,
        portfolio_id      UUID,
        trader_id         UUID                    NOT NULL,
        account_id        UUID,
        side              order_side_enum         NOT NULL,
        order_type        order_type_enum         NOT NULL,
        order_status      order_status_enum       NOT NULL DEFAULT 'PENDING_NEW',
        time_in_force     time_in_force_enum      NOT NULL DEFAULT 'DAY',
        order_capacity    order_capacity_enum     NOT NULL DEFAULT 'AGENCY',
        order_qty         NUMERIC(20,6)           NOT NULL,
        price             NUMERIC(20,6),
        stop_price        NUMERIC(20,6),
        cum_qty           NUMERIC(20,6)           NOT NULL DEFAULT 0,
        leaves_qty        NUMERIC(20,6)           NOT NULL DEFAULT 0,
        avg_px            NUMERIC(20,6),
        currency          VARCHAR(3)              NOT NULL,
        venue             VARCHAR(20),
        desk              VARCHAR(50),
        expire_time       TIMESTAMPTZ,
        compliance_checked BOOLEAN               NOT NULL DEFAULT false,
        compliance_notes  VARCHAR(500),
        text              TEXT,
        rejected_reason   VARCHAR(500),
        transact_time     TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        created_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_orders PRIMARY KEY (id),
        CONSTRAINT uq_orders_cl_ord_id UNIQUE (cl_ord_id),
        CONSTRAINT ck_orders_qty CHECK (order_qty > 0),
        CONSTRAINT fk_orders_instrument FOREIGN KEY (instrument_id) REFERENCES instruments (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_orders_instrument_id ON orders (instrument_id)`);
    await queryRunner.query(`CREATE INDEX idx_orders_portfolio_id ON orders (portfolio_id)`);
    await queryRunner.query(`CREATE INDEX idx_orders_status ON orders (order_status)`);
    await queryRunner.query(`CREATE INDEX idx_orders_trader_id ON orders (trader_id)`);
    await queryRunner.query(`CREATE INDEX idx_orders_transact_time ON orders (transact_time DESC)`);
    await queryRunner.query(`CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);

    // ─── executions ────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE executions (
        id                UUID                      NOT NULL DEFAULT gen_random_uuid(),
        exec_id           VARCHAR(50)               NOT NULL,
        order_id          UUID                      NOT NULL,
        instrument_id     UUID                      NOT NULL,
        portfolio_id      UUID,
        exec_type         exec_type_enum            NOT NULL,
        side              VARCHAR(20)               NOT NULL,
        last_qty          NUMERIC(20,6)             NOT NULL,
        last_px           NUMERIC(20,6)             NOT NULL,
        commission        NUMERIC(20,6)             NOT NULL DEFAULT 0,
        comm_type         VARCHAR(2)                NOT NULL DEFAULT '3',
        gross_amount      NUMERIC(20,6)             NOT NULL,
        net_amount        NUMERIC(20,6)             NOT NULL,
        currency          VARCHAR(3)                NOT NULL,
        last_mkt          VARCHAR(20),
        counterparty_id   VARCHAR(50),
        trade_date        DATE                      NOT NULL,
        settlement_type   settlement_type_enum      NOT NULL DEFAULT 'REGULAR',
        settlement_date   DATE                      NOT NULL,
        settlement_status settlement_status_enum    NOT NULL DEFAULT 'PENDING',
        transact_time     TIMESTAMPTZ               NOT NULL,
        alloc_id          VARCHAR(50),
        journal_id        UUID,
        created_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_executions PRIMARY KEY (id),
        CONSTRAINT uq_exec_id UNIQUE (exec_id),
        CONSTRAINT ck_exec_last_qty CHECK (last_qty > 0),
        CONSTRAINT ck_exec_last_px CHECK (last_px > 0),
        CONSTRAINT fk_executions_order FOREIGN KEY (order_id) REFERENCES orders (id),
        CONSTRAINT fk_executions_instrument FOREIGN KEY (instrument_id) REFERENCES instruments (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_exec_order_id ON executions (order_id)`);
    await queryRunner.query(`CREATE INDEX idx_exec_instrument_id ON executions (instrument_id)`);
    await queryRunner.query(`CREATE INDEX idx_exec_trade_date ON executions (trade_date DESC)`);
    await queryRunner.query(`CREATE INDEX idx_exec_settlement ON executions (settlement_date, settlement_status)`);

    // ─── positions ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE positions (
        id                UUID            NOT NULL DEFAULT gen_random_uuid(),
        portfolio_id      UUID            NOT NULL,
        instrument_id     UUID            NOT NULL,
        quantity          NUMERIC(20,6)   NOT NULL DEFAULT 0,
        avg_cost          NUMERIC(20,6)   NOT NULL DEFAULT 0,
        cost_basis        NUMERIC(20,6)   NOT NULL DEFAULT 0,
        market_value      NUMERIC(20,6)   NOT NULL DEFAULT 0,
        unrealized_pnl    NUMERIC(20,6)   NOT NULL DEFAULT 0,
        realized_pnl      NUMERIC(20,6)   NOT NULL DEFAULT 0,
        total_pnl         NUMERIC(20,6)   NOT NULL DEFAULT 0,
        day_pnl           NUMERIC(20,6)   NOT NULL DEFAULT 0,
        last_mark_price   NUMERIC(20,6),
        mark_currency     VARCHAR(3)      NOT NULL,
        base_currency_pnl NUMERIC(20,6)   NOT NULL DEFAULT 0,
        base_currency     VARCHAR(3)      NOT NULL,
        notional_value    NUMERIC(20,6),
        fx_rate           NUMERIC(16,8)   NOT NULL DEFAULT 1,
        position_date     DATE            NOT NULL,
        last_mark_time    TIMESTAMPTZ,
        created_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
        CONSTRAINT pk_positions PRIMARY KEY (id),
        CONSTRAINT uq_positions_portfolio_instrument UNIQUE (portfolio_id, instrument_id),
        CONSTRAINT fk_positions_portfolio FOREIGN KEY (portfolio_id) REFERENCES portfolios (id),
        CONSTRAINT fk_positions_instrument FOREIGN KEY (instrument_id) REFERENCES instruments (id)
      )
    `);
    await queryRunner.query(`CREATE INDEX idx_positions_portfolio_id ON positions (portfolio_id)`);
    await queryRunner.query(`CREATE INDEX idx_positions_instrument_id ON positions (instrument_id)`);
    await queryRunner.query(`CREATE TRIGGER trg_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION set_updated_at()`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const t of ['positions','executions','orders','portfolios','instruments']) {
      await queryRunner.query(`DROP TRIGGER IF EXISTS trg_${t}_updated_at ON ${t}`);
      await queryRunner.query(`DROP TABLE IF EXISTS ${t}`);
    }
    for (const e of ['risk_profile_enum','portfolio_status_enum','portfolio_type_enum','settlement_status_enum','settlement_type_enum','exec_type_enum','order_capacity_enum','order_status_enum','time_in_force_enum','order_type_enum','order_side_enum','derivative_type_enum','instrument_status_enum','asset_class_enum']) {
      await queryRunner.query(`DROP TYPE IF EXISTS ${e}`);
    }
  }
}
