import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Execution, SettlementStatus, Order, OrderStatus } from '@tpt/database';

export interface TradeLifecycleState {
  stage: 'PRE_TRADE' | 'ORDER_ENTRY' | 'EXECUTION' | 'POST_TRADE' | 'SETTLEMENT' | 'CLOSED';
  orderId?: string;
  clOrdId?: string;
  executionId?: string;
  settlementStatus?: SettlementStatus;
  summary: string;
}

/**
 * Trade Lifecycle service.
 * Orchestrates the complete trade lifecycle:
 *
 *   PRE_TRADE → ORDER_ENTRY → EXECUTION → POST_TRADE → SETTLEMENT → CLOSED
 *
 * Pre-Trade:   Risk checks, compliance checks, investment policy validation
 * Order Entry: OMS order creation, routing to venue
 * Execution:   Fill received from venue (FIX Execution Report)
 * Post-Trade:  Allocation, confirmation, affirmation (DTC/SWIFT)
 * Settlement:  DvP (Delivery vs Payment) — T+2 for equities
 * Closed:      Settled, archived
 */
@Injectable()
export class TradeLifecycleService {
  private readonly logger = new Logger(TradeLifecycleService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Execution)
    private readonly execRepo: Repository<Execution>,
  ) {}

  async getOrderLifecycle(orderId: string): Promise<{
    order: Order;
    executions: Execution[];
    currentStage: string;
    timeline: Array<{ stage: string; timestamp: string; details: string }>;
  }> {
    const order = await this.orderRepo.findOne({ where: { id: orderId } });
    if (!order) throw new Error(`Order ${orderId} not found`);

    const executions = await this.execRepo.find({
      where: { orderId },
      order: { transactTime: 'ASC' },
    });

    const timeline: Array<{ stage: string; timestamp: string; details: string }> = [
      {
        stage: 'ORDER_ENTRY',
        timestamp: order.createdAt.toISOString(),
        details: `Order ${order.clOrdId}: ${order.side} ${order.orderQty} @ ${order.price ?? 'MKT'}`,
      },
    ];

    for (const exec of executions) {
      timeline.push({
        stage: 'EXECUTION',
        timestamp: exec.transactTime.toISOString(),
        details: `Fill: ${exec.lastQty} @ ${exec.lastPx} on ${exec.lastMkt ?? 'venue'}`,
      });
      if (exec.settlementStatus === SettlementStatus.SETTLED) {
        timeline.push({
          stage: 'SETTLEMENT',
          timestamp: exec.settlementDate.toISOString(),
          details: `DvP settled: ${exec.grossAmount} ${exec.currency}`,
        });
      }
    }

    const currentStage = this.deriveCurrentStage(order, executions);

    return { order, executions, currentStage, timeline };
  }

  async getFailedSettlements(): Promise<Array<{
    executionId: string;
    execId: string;
    orderId: string;
    settlementDate: Date;
    grossAmount: string;
    currency: string;
    daysOverdue: number;
  }>> {
    const today = new Date();
    const failed = await this.execRepo
      .createQueryBuilder('e')
      .where("e.settlement_status IN ('PENDING','AFFIRMED')")
      .andWhere('e.settlement_date < :today', { today })
      .orderBy('e.settlement_date', 'ASC')
      .getMany();

    return failed.map((e) => {
      const msDiff = today.getTime() - e.settlementDate.getTime();
      const daysOverdue = Math.floor(msDiff / (1000 * 60 * 60 * 24));
      return {
        executionId: e.id,
        execId: e.execId,
        orderId: e.orderId,
        settlementDate: e.settlementDate,
        grossAmount: e.grossAmount,
        currency: e.currency,
        daysOverdue,
      };
    });
  }

  async getSettlementLadder(days = 5): Promise<Array<{
    settlementDate: string;
    execCount: number;
    totalBuyNotional: string;
    totalSellNotional: string;
  }>> {
    const ladder: Array<{
      settlementDate: string;
      execCount: number;
      totalBuyNotional: string;
      totalSellNotional: string;
    }> = [];

    const today = new Date();
    for (let i = 0; i <= days; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = d.toISOString().split('T')[0];

      const executions = await this.execRepo
        .createQueryBuilder('e')
        .where('e.settlement_date = :date', { date: d })
        .andWhere("e.settlement_status IN ('PENDING','AFFIRMED','CONFIRMED')")
        .getMany();

      let buyNotional = 0;
      let sellNotional = 0;
      for (const e of executions) {
        const notional = parseFloat(e.grossAmount);
        if (e.side === 'BUY') buyNotional += notional;
        else sellNotional += notional;
      }

      if (executions.length > 0) {
        ladder.push({
          settlementDate: dateStr,
          execCount: executions.length,
          totalBuyNotional: buyNotional.toFixed(2),
          totalSellNotional: sellNotional.toFixed(2),
        });
      }
    }

    return ladder;
  }

  private deriveCurrentStage(order: Order, executions: Execution[]): string {
    if (!executions.length) {
      if (order.orderStatus === OrderStatus.NEW || order.orderStatus === OrderStatus.PENDING_NEW) {
        return 'ORDER_ENTRY';
      }
      return order.orderStatus;
    }

    const lastExec = executions[executions.length - 1];
    if (lastExec.settlementStatus === SettlementStatus.SETTLED) return 'CLOSED';
    if (lastExec.settlementStatus === SettlementStatus.CONFIRMED) return 'SETTLEMENT';
    if (order.orderStatus === OrderStatus.FILLED) return 'POST_TRADE';
    return 'EXECUTION';
  }
}
