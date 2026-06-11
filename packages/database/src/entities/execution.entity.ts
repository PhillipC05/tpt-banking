import {
  Entity, PrimaryGeneratedColumn, Column,
  CreateDateColumn, Index, BeforeInsert,
} from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

export enum ExecType {
  NEW = 'NEW',                       // FIX ExecType=0
  PARTIAL_FILL = 'PARTIAL_FILL',     // FIX ExecType=1
  FILL = 'FILL',                     // FIX ExecType=2
  CANCELLED = 'CANCELLED',           // FIX ExecType=4
  REPLACE = 'REPLACE',               // FIX ExecType=5
  PENDING_CANCEL = 'PENDING_CANCEL', // FIX ExecType=6
  STOPPED = 'STOPPED',               // FIX ExecType=7
  REJECTED = 'REJECTED',             // FIX ExecType=8
  EXPIRED = 'EXPIRED',               // FIX ExecType=C
  TRADE = 'TRADE',                   // FIX ExecType=F — confirmed trade
  TRADE_CORRECT = 'TRADE_CORRECT',   // FIX ExecType=G
  TRADE_CANCEL = 'TRADE_CANCEL',     // FIX ExecType=H
}

export enum SettlementType {
  REGULAR = 'REGULAR',      // T+2 (equities)
  NEXT_DAY = 'NEXT_DAY',    // T+1
  CASH = 'CASH',            // T+0
  FUTURE = 'FUTURE',        // Future date
  SELLER_OPTION = 'SELLER_OPTION',
  T_PLUS_5 = 'T_PLUS_5',   // FI default
}

export enum SettlementStatus {
  PENDING = 'PENDING',
  AFFIRMED = 'AFFIRMED',
  CONFIRMED = 'CONFIRMED',
  SETTLED = 'SETTLED',
  FAILED = 'FAILED',
  PARTIAL = 'PARTIAL',
}

/**
 * Execution (Fill) entity — FIX Execution Report (MsgType=8).
 *
 * Created for every fill or partial fill on an order.
 * Carries the full FIX execution report fields required for post-trade processing.
 */
@Entity('executions')
export class Execution {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** FIX ExecID (Tag 17) — unique execution identifier */
  @Index('idx_exec_id', { unique: true })
  @Column({ name: 'exec_id', type: 'varchar', length: 50, unique: true })
  execId!: string;

  @Index('idx_exec_order_id')
  @Column({ name: 'order_id', type: 'uuid' })
  orderId!: string;

  @Index('idx_exec_instrument_id')
  @Column({ name: 'instrument_id', type: 'uuid' })
  instrumentId!: string;

  @Column({ name: 'portfolio_id', type: 'uuid', nullable: true })
  portfolioId!: string | null;

  /** FIX ExecType (Tag 150) */
  @Column({ name: 'exec_type', type: 'enum', enum: ExecType })
  execType!: ExecType;

  /** FIX Side (Tag 54) — copied from order */
  @Column({ type: 'varchar', length: 20 })
  side!: string;

  /** FIX LastQty (Tag 32) — quantity of this fill */
  @Column({ name: 'last_qty', type: 'numeric', precision: 20, scale: 6 })
  lastQty!: string;

  /** FIX LastPx (Tag 31) — fill price */
  @Column({ name: 'last_px', type: 'numeric', precision: 20, scale: 6 })
  lastPx!: string;

  /** FIX Commission (Tag 12) */
  @Column({ type: 'numeric', precision: 20, scale: 6, default: '0' })
  commission!: string;

  /** FIX CommType (Tag 13) */
  @Column({ name: 'comm_type', type: 'varchar', length: 2, default: '3' })
  commType!: string;

  /** Gross trade amount = lastQty × lastPx */
  @Column({ name: 'gross_amount', type: 'numeric', precision: 20, scale: 6 })
  grossAmount!: string;

  /** Net amount = grossAmount ± commission ± fees */
  @Column({ name: 'net_amount', type: 'numeric', precision: 20, scale: 6 })
  netAmount!: string;

  /** ISO 4217 currency */
  @Column({ type: 'varchar', length: 3 })
  currency!: string;

  /** Exchange/venue MIC where execution occurred */
  @Column({ name: 'last_mkt', type: 'varchar', length: 20, nullable: true })
  lastMkt!: string | null;

  /** FIX CounterpartyID */
  @Column({ name: 'counterparty_id', type: 'varchar', length: 50, nullable: true })
  counterpartyId!: string | null;

  /** FIX TradeDate (Tag 75) — YYYYMMDD */
  @Column({ name: 'trade_date', type: 'date' })
  tradeDate!: Date;

  /** Settlement type (T+2, T+1, etc.) */
  @Column({ name: 'settlement_type', type: 'enum', enum: SettlementType, default: SettlementType.REGULAR })
  settlementType!: SettlementType;

  /** FIX SettlDate (Tag 64) */
  @Column({ name: 'settlement_date', type: 'date' })
  settlementDate!: Date;

  @Column({ name: 'settlement_status', type: 'enum', enum: SettlementStatus, default: SettlementStatus.PENDING })
  settlementStatus!: SettlementStatus;

  /** FIX TransactTime (Tag 60) — time of execution */
  @Column({ name: 'transact_time', type: 'timestamptz' })
  transactTime!: Date;

  /** Allocation ID (after post-trade allocation) */
  @Column({ name: 'alloc_id', type: 'varchar', length: 50, nullable: true })
  allocId!: string | null;

  /** Journal entry ID (created on settlement) */
  @Column({ name: 'journal_id', type: 'uuid', nullable: true })
  journalId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  generateExecId(): void {
    if (!this.execId) {
      const ts = Date.now().toString().slice(-10);
      const rand = uuidv4().replace(/-/g, '').slice(0, 6).toUpperCase();
      this.execId = `EX${ts}${rand}`;
    }
  }
}
