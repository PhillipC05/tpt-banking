import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum AssetClass {
  EQUITY = 'EQUITY',
  FIXED_INCOME = 'FIXED_INCOME',
  DERIVATIVE = 'DERIVATIVE',
  FX = 'FX',
  COMMODITY = 'COMMODITY',
  CRYPTO = 'CRYPTO',
  FUND = 'FUND',
  MONEY_MARKET = 'MONEY_MARKET',
}

export enum InstrumentStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DELISTED = 'DELISTED',
  SUSPENDED = 'SUSPENDED',
}

export enum DerivativeType {
  CALL_OPTION = 'CALL_OPTION',
  PUT_OPTION = 'PUT_OPTION',
  FUTURE = 'FUTURE',
  FORWARD = 'FORWARD',
  SWAP = 'SWAP',
  SWAPTION = 'SWAPTION',
  CDS = 'CDS',
  CLN = 'CLN',
  WARRANT = 'WARRANT',
}

/**
 * Financial instrument master data.
 * Covers equities, fixed income, derivatives, FX, commodities, and funds.
 *
 * Identification hierarchy: ISIN (global) → CUSIP (US) → SEDOL (UK) → ticker
 */
@Entity('instruments')
export class Instrument {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_instrument_isin', { unique: true })
  @Column({ type: 'varchar', length: 12, unique: true, nullable: true })
  isin!: string | null;

  @Index('idx_instrument_cusip', { unique: true })
  @Column({ type: 'varchar', length: 9, unique: true, nullable: true })
  cusip!: string | null;

  @Index('idx_instrument_sedol')
  @Column({ type: 'varchar', length: 7, nullable: true })
  sedol!: string | null;

  @Index('idx_instrument_ticker')
  @Column({ type: 'varchar', length: 20, nullable: true })
  ticker!: string | null;

  /** Bloomberg ticker (e.g. AAPL US Equity) */
  @Column({ name: 'bloomberg_id', type: 'varchar', length: 50, nullable: true })
  bloombergId!: string | null;

  /** Reuters RIC (e.g. AAPL.OQ) */
  @Column({ name: 'ric', type: 'varchar', length: 30, nullable: true })
  ric!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  @Column({ name: 'long_name', type: 'varchar', length: 500, nullable: true })
  longName!: string | null;

  @Column({ name: 'asset_class', type: 'enum', enum: AssetClass })
  assetClass!: AssetClass;

  @Column({ name: 'instrument_status', type: 'enum', enum: InstrumentStatus, default: InstrumentStatus.ACTIVE })
  instrumentStatus!: InstrumentStatus;

  /** ISO 4217 currency of denomination */
  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** Exchange/venue MIC code (e.g. XNAS = NASDAQ, XNYS = NYSE) */
  @Column({ type: 'varchar', length: 10, nullable: true })
  exchange!: string | null;

  /** Country of issue (ISO 3166-1 alpha-2) */
  @Column({ name: 'country_of_issue', type: 'varchar', length: 2, nullable: true })
  countryOfIssue!: string | null;

  /** Sector (for equities) — GICS Level 1 */
  @Column({ type: 'varchar', length: 100, nullable: true })
  sector!: string | null;

  /** Industry group */
  @Column({ type: 'varchar', length: 100, nullable: true })
  industry!: string | null;

  // ─── Fixed Income fields ───────────────────────────────────────────────────
  @Column({ name: 'coupon_rate', type: 'numeric', precision: 8, scale: 6, nullable: true })
  couponRate!: string | null;

  @Column({ name: 'maturity_date', type: 'date', nullable: true })
  maturityDate!: Date | null;

  @Column({ name: 'face_value', type: 'numeric', precision: 20, scale: 6, nullable: true })
  faceValue!: string | null;

  @Column({ name: 'coupon_frequency', type: 'varchar', length: 20, nullable: true })
  couponFrequency!: string | null;

  @Column({ name: 'credit_rating', type: 'varchar', length: 10, nullable: true })
  creditRating!: string | null;

  // ─── Derivative fields (JSONB for flexibility) ─────────────────────────────
  @Column({ name: 'derivative_type', type: 'enum', enum: DerivativeType, nullable: true })
  derivativeType!: DerivativeType | null;

  @Column({ name: 'underlying_id', type: 'uuid', nullable: true })
  underlyingId!: string | null;

  /** Strike price, expiry, notional, etc. — varies by derivative type */
  @Column({ name: 'derivative_details', type: 'jsonb', nullable: true })
  derivativeDetails!: Record<string, unknown> | null;

  /** Lot size / minimum trade unit */
  @Column({ name: 'lot_size', type: 'numeric', precision: 20, scale: 6, default: '1' })
  lotSize!: string;

  /** Price multiplier (100 for equity options) */
  @Column({ name: 'price_multiplier', type: 'numeric', precision: 10, scale: 4, default: '1' })
  priceMultiplier!: string;

  @Column({ name: 'last_price', type: 'numeric', precision: 20, scale: 6, nullable: true })
  lastPrice!: string | null;

  @Column({ name: 'price_updated_at', type: 'timestamptz', nullable: true })
  priceUpdatedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
