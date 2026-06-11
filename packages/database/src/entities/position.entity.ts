import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, Unique,
} from 'typeorm';

/**
 * Position entity — real-time book of record for portfolio holdings.
 *
 * Positions are signed:
 *   - Positive quantity = long position
 *   - Negative quantity = short position
 *
 * CRITICAL: There is one position record per (portfolio_id, instrument_id).
 * The position is updated atomically when executions are processed.
 * All P&L figures are calculated in the instrument's denomination currency,
 * then converted to the portfolio base currency for reporting.
 */
@Entity('positions')
@Unique('uq_positions_portfolio_instrument', ['portfolioId', 'instrumentId'])
export class Position {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index('idx_positions_portfolio_id')
  @Column({ name: 'portfolio_id', type: 'uuid' })
  portfolioId!: string;

  @Index('idx_positions_instrument_id')
  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  /** Signed quantity: positive = long, negative = short */
  @Column({ type: 'numeric', precision: 20, scale: 6, default: '0' })
  quantity!: string;

  /** Average cost basis (cost per unit) */
  @Column({ name: 'avg_cost', type: 'numeric', precision: 20, scale: 6, default: '0' })
  avgCost!: string;

  /** Total cost basis = quantity × avgCost */
  @Column({ name: 'cost_basis', type: 'numeric', precision: 20, scale: 6, default: '0' })
  costBasis!: string;

  /** Current market value = quantity × lastPrice */
  @Column({ name: 'market_value', type: 'numeric', precision: 20, scale: 6, default: '0' })
  marketValue!: string;

  /** Unrealized P&L = marketValue - costBasis */
  @Column({ name: 'unrealized_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  unrealizedPnl!: string;

  /** Realized P&L (from closed trades) */
  @Column({ name: 'realized_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  realizedPnl!: string;

  /** Total P&L = unrealizedPnl + realizedPnl */
  @Column({ name: 'total_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  totalPnl!: string;

  /** Day P&L (reset each trading day) */
  @Column({ name: 'day_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  dayPnl!: string;

  /** Last mark price used for P&L calculation */
  @Column({ name: 'last_mark_price', type: 'numeric', precision: 20, scale: 6, nullable: true })
  lastMarkPrice!: string | null;

  @Column({ name: 'mark_currency', type: 'varchar', length: 3 })
  markCurrency!: string;

  /** Portfolio base currency P&L (after FX conversion) */
  @Column({ name: 'base_currency_pnl', type: 'numeric', precision: 20, scale: 6, default: '0' })
  baseCurrencyPnl!: string;

  @Column({ name: 'base_currency', type: 'varchar', length: 3 })
  baseCurrency!: string;

  /** Notional value (for derivatives = quantity × priceMultiplier × price) */
  @Column({ name: 'notional_value', type: 'numeric', precision: 20, scale: 6, nullable: true })
  notionalValue!: string | null;

  /** FX rate used for base currency conversion */
  @Column({ name: 'fx_rate', type: 'numeric', precision: 16, scale: 8, default: '1' })
  fxRate!: string;

  @Column({ name: 'position_date', type: 'date' })
  positionDate!: Date;

  @Column({ name: 'last_mark_time', type: 'timestamptz', nullable: true })
  lastMarkTime!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
