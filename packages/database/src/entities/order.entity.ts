import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, UpdateDateColumn, Index, BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

// ─── FIX Protocol Enums (ISO 15022 / FIX 4.4 / FIX 5.0) ─────────────────────

export enum OrderSide {
  BUY = 'BUY',                   // FIX Side=1
  SELL = 'SELL',                 // FIX Side=2
  SELL_SHORT = 'SELL_SHORT',     // FIX Side=5
  BUY_MINUS = 'BUY_MINUS',       // FIX Side=3
}

export enum OrderType {
  MARKET = 'MARKET',             // FIX OrdType=1
  LIMIT = 'LIMIT',               // FIX OrdType=2
  STOP = 'STOP',                 // FIX OrdType=3
  STOP_LIMIT = 'STOP_LIMIT',     // FIX OrdType=4
  MARKET_ON_CLOSE = 'MARKET_ON_CLOSE', // FIX OrdType=5
  LIMIT_ON_CLOSE = 'LIMIT_ON_CLOSE',   // FIX OrdType=B
  PEGGED = 'PEGGED',             // FIX OrdType=P
  TWAP = 'TWAP',                 // Algorithmic
  VWAP = 'VWAP',                 // Algorithmic
}

export enum TimeInForce {
  DAY = 'DAY',                   // FIX TimeInForce=0 — expires at end of day
  GTC = 'GTC',                   // Good Till Cancel — FIX=1
  AT_THE_OPEN = 'AT_THE_OPEN',   // FIX=2
  IOC = 'IOC',                   // Immediate or Cancel — FIX=3
  FOK = 'FOK',                   // Fill or Kill — FIX=4
  GTD = 'GTD',                   // Good Till Date — FIX=6
  AT_THE_CLOSE = 'AT_THE_CLOSE', // FIX=7
}

export enum OrderStatus {
  PENDING_NEW = 'PENDING_NEW',           // FIX OrdStatus=A
  NEW = 'NEW',                           // FIX OrdStatus=0
  PARTIALLY_FILLED = 'PARTIALLY_FILLED', // FIX OrdStatus=1
  FILLED = 'FILLED',                     // FIX OrdStatus=2
  DONE_FOR_DAY = 'DONE_FOR_DAY',         // FIX OrdStatus=3
  CANCELLED = 'CANCELLED',               // FIX OrdStatus=4
  PENDING_CANCEL = 'PENDING_CANCEL',     // FIX OrdStatus=6
  STOPPED = 'STOPPED',                   // FIX OrdStatus=7
  REJECTED = 'REJECTED',                 // FIX OrdStatus=8
  SUSPENDED = 'SUSPENDED',               // FIX OrdStatus=9
  PENDING_REPLACE = 'PENDING_REPLACE',   // FIX OrdStatus=E
  EXPIRED = 'EXPIRED',                   // FIX OrdStatus=C
}

export enum OrderCapacity {
  AGENCY = 'AGENCY',         // FIX OrderCapacity=A — trading on behalf of client
  PRINCIPAL = 'PRINCIPAL',   // FIX OrderCapacity=P — trading own book
  RISKLESS_PRINCIPAL = 'RISKLESS_PRINCIPAL',
}

/**
 * Order entity — FIX protocol-compliant Order Management System record.
 *
 * Captures the full order lifecycle from submission through execution.
 * All FIX tag values are documented in comments.
 */
@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** FIX ClOrdID (Tag 11) — unique client order identifier */
  @Index('idx_orders_cl_ord_id', { unique: true })
  @Column({ name: 'cl_ord_id', type: 'varchar', length: 50, unique: true })
  clOrdId!: string;

  /** FIX OrdID (Tag 37) — exchange-assigned order ID */
  @Column({ name: 'ord_id', type: 'varchar', length: 100, nullable: true })
  ordId!: string | null;

  @Index('idx_orders_instrument_id')
  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Index('idx_orders_portfolio_id')
  @Column({ name: 'portfolio_id', type: 'uuid', nullable: true })
  portfolioId!: string | null;

  @Column({ name: 'trader_id', type: 'uuid' })
  traderId!: string;

  /** FIX Account (Tag 1) */
  @Column({ name: 'account_id', type: 'uuid', nullable: true })
  accountId!: string | null;

  /** FIX Side (Tag 54) */
  @Column({ type: 'enum', enum: OrderSide })
  side!: OrderSide;

  /** FIX OrdType (Tag 40) */
  @Column({ name: 'order_type', type: 'enum', enum: OrderType })
  orderType!: OrderType;

  /** FIX OrdStatus (Tag 39) */
  @Column({ name: 'order_status', type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING_NEW })
  orderStatus!: OrderStatus;

  /** FIX TimeInForce (Tag 59) */
  @Column({ name: 'time_in_force', type: 'enum', enum: TimeInForce, default: TimeInForce.DAY })
  timeInForce!: TimeInForce;

  /** FIX OrderCapacity (Tag 528) */
  @Column({ name: 'order_capacity', type: 'enum', enum: OrderCapacity, default: OrderCapacity.AGENCY })
  orderCapacity!: OrderCapacity;

  /** FIX OrderQty (Tag 38) — original order quantity */
  @Column({ name: 'order_qty', type: 'numeric', precision: 20, scale: 6 })
  orderQty!: string;

  /** FIX Price (Tag 44) — limit price (null for market orders) */
  @Column({ type: 'numeric', precision: 20, scale: 6, nullable: true })
  price!: string | null;

  /** FIX StopPx (Tag 99) — stop price */
  @Column({ name: 'stop_price', type: 'numeric', precision: 20, scale: 6, nullable: true })
  stopPrice!: string | null;

  /** FIX CumQty (Tag 14) — cumulative filled quantity */
  @Column({ name: 'cum_qty', type: 'numeric', precision: 20, scale: 6, default: '0' })
  cumQty!: string;

  /** FIX LeavesQty (Tag 151) — remaining open quantity */
  @Column({ name: 'leaves_qty', type: 'numeric', precision: 20, scale: 6, default: '0' })
  leavesQty!: string;

  /** FIX AvgPx (Tag 6) — average fill price */
  @Column({ name: 'avg_px', type: 'numeric', precision: 20, scale: 6, nullable: true })
  avgPx!: string | null;

  /** ISO 4217 currency of denomination */
  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** FIX Venue/ExDest (Tag 100) */
  @Column({ type: 'varchar', length: 20, nullable: true })
  venue!: string | null;

  /** Desk / strategy (internal routing) */
  @Column({ type: 'varchar', length: 50, nullable: true })
  desk!: string | null;

  /** Good Till Date (for GTD orders) */
  @Column({ name: 'expire_time', type: 'timestamptz', nullable: true })
  expireTime!: Date | null;

  /** Pre-trade compliance check result */
  @Column({ name: 'compliance_checked', type: 'boolean', default: false })
  complianceChecked!: boolean;

  @Column({ name: 'compliance_notes', type: 'varchar', length: 500, nullable: true })
  complianceNotes!: string | null;

  /** FIX Text (Tag 58) — free text */
  @Column({ type: 'text', nullable: true })
  text!: string | null;

  @Column({ name: 'rejected_reason', type: 'varchar', length: 500, nullable: true })
  rejectedReason!: string | null;

  /** ISO 8601 — FIX TransactTime (Tag 60) */
  @Column({ name: 'transact_time', type: 'timestamptz' })
  transactTime!: Date;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  generateClOrdId(): void {
    if (!this.clOrdId) {
      const ts = Date.now().toString().slice(-10);
      const rand = uuidv4().replace(/-/g, '').slice(0, 8).toUpperCase();
      this.clOrdId = `CLO${ts}${rand}`;
    }
    if (!this.transactTime) this.transactTime = new Date();
    if (!this.leavesQty && this.orderQty) this.leavesQty = this.orderQty;
  }
}
