import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

export enum PortfolioType {
  PROP_TRADING = 'PROP_TRADING',       // Proprietary trading book
  CLIENT_MANAGED = 'CLIENT_MANAGED',   // Managing client assets
  HEDGE_FUND = 'HEDGE_FUND',
  PENSION = 'PENSION',
  ENDOWMENT = 'ENDOWMENT',
  FAMILY_OFFICE = 'FAMILY_OFFICE',
  SEGREGATED = 'SEGREGATED',           // Separately managed account
  OMNIBUS = 'OMNIBUS',                 // Pooled/commingled
}

export enum PortfolioStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  CLOSED = 'CLOSED',
}

export enum RiskProfile {
  CONSERVATIVE = 'CONSERVATIVE',
  MODERATE = 'MODERATE',
  BALANCED = 'BALANCED',
  GROWTH = 'GROWTH',
  AGGRESSIVE = 'AGGRESSIVE',
}

/**
 * Portfolio entity — the container for positions and performance measurement.
 *
 * A portfolio can represent a trading book, managed account, or fund.
 * Investment Policy Statement (IPS) constraints are stored in ipsBounds.
 */
@Entity('portfolios')
export class Portfolio {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_portfolio_code', { unique: true })
  @Column({ name: 'portfolio_code', type: 'varchar', length: 30, unique: true })
  portfolioCode!: string;

  @Column({ name: 'display_name', type: 'varchar', length: 200 })
  displayName!: string;

  @Column({ name: 'description', type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'enum', enum: PortfolioType })
  type!: PortfolioType;

  @Column({ type: 'enum', enum: PortfolioStatus, default: PortfolioStatus.ACTIVE })
  status!: PortfolioStatus;

  @Column({ name: 'risk_profile', type: 'enum', enum: RiskProfile, default: RiskProfile.BALANCED })
  riskProfile!: RiskProfile;

  /** Portfolio base currency (all P&L reported in this currency) */
  @Column({ name: 'base_currency', type: 'varchar', length: 3 })
  baseCurrency!: string;

  /** Owner — customer UUID or internal desk ID */
  @Column({ name: 'owner_id', type: 'uuid', nullable: true })
  ownerId!: string | null;

  /** Assigned portfolio manager */
  @Column({ name: 'manager_id', type: 'uuid', nullable: true })
  managerId!: string | null;

  /** Total market value (sum of all positions, in base currency) */
  @Column({ name: 'total_market_value', type: 'numeric', precision: 20, scale: 6, default: '0' })
  totalMarketValue!: string;

  /** Total unrealized P&L */
  @Column({ name: 'total_unrealized_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  totalUnrealizedPnl!: string;

  /** Total realized P&L (YTD) */
  @Column({ name: 'total_realized_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  totalRealizedPnl!: string;

  /** Day P&L (reset at market open) */
  @Column({ name: 'day_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  dayPnl!: string;

  /** Cash balance in base currency */
  @Column({ name: 'cash_balance', type: 'numeric', precision: 20, scale: 6, default: '0' })
  cashBalance!: string;

  /** Investment Policy Statement bounds (asset class limits, concentration limits) */
  @Column({ name: 'ips_bounds', type: 'jsonb', nullable: true })
  ipsBounds!: {
    maxEquityPct?: number;
    maxFixedIncomePct?: number;
    maxSinglePositionPct?: number;
    maxCashPct?: number;
    minCashPct?: number;
    allowedAssetClasses?: string[];
    excludedSectors?: string[];
  } | null;

  /** Benchmark (e.g. SP500, FTSE100, MSCI World) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  benchmark!: string | null;

  /** Inception date */
  @Column({ name: 'inception_date', type: 'date', nullable: true })
  inceptionDate!: Date | null;

  @Column({ name: 'closed_date', type: 'date', nullable: true })
  closedDate!: Date | null;

  @Column({ name: 'last_valued_at', type: 'timestamptz', nullable: true })
  lastValuedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
