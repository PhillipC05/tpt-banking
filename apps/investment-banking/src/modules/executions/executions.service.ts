import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Execution, ExecType, SettlementType, SettlementStatus,
  Order, OrderStatus,
} from '@tpt/database';
import { OrdersService } from '../orders/orders.service';
import { PositionsService } from '../positions/positions.service';

export interface RecordFillDto {
  orderId: string;
  execType?: ExecType;
  lastQty: number;
  lastPx: number;
  commission?: number;
  lastMkt?: string;
  counterpartyId?: string;
  settlementType?: SettlementType;
}

@Injectable()
export class ExecutionsService {
  private readonly logger = new Logger(ExecutionsService.name);

  constructor(
    @InjectRepository(Execution)
    private readonly execRepo: Repository<Execution>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    private readonly ordersService: OrdersService,
    private readonly positionsService: PositionsService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Record a fill (execution) against an order.
   * Updates order state and fires position update.
   */
  async recordFill(dto: RecordFillDto): Promise<Execution> {
    const order = await this.orderRepo.findOne({ where: { id: dto.orderId } });
    if (!order) throw new NotFoundException(`Order ${dto.orderId} not found`);

    if (order.orderStatus === OrderStatus.CANCELLED ||
        order.orderStatus === OrderStatus.REJECTED ||
        order.orderStatus === OrderStatus.FILLED) {
      throw new BadRequestException(
        `Order ${dto.orderId} is ${order.orderStatus} and cannot receive fills`,
      );
    }

    const remainingQty = parseFloat(order.leavesQty);
    if (dto.lastQty > remainingQty) {
      throw new BadRequestException(
        `Fill quantity ${dto.lastQty} exceeds remaining order qty ${remainingQty}`,
      );
    }

    const grossAmount = dto.lastQty * dto.lastPx;
    const commission = dto.commission ?? 0;
    const netAmount = order.side === 'BUY'
      ? grossAmount + commission
      : grossAmount - commission;

    const tradeDate = new Date();
    const settlementDate = this.calculateSettlementDate(
      tradeDate,
      dto.settlementType ?? SettlementType.REGULAR,
    );

    return this.dataSource.transaction(async (manager) => {
      const execution = manager.create(Execution, {
        orderId: dto.orderId,
        instrumentId: order.instrumentId,
        portfolioId: order.portfolioId ?? null,
        execType: dto.execType ?? ExecType.TRADE,
        side: order.side,
        lastQty: dto.lastQty.toString(),
        lastPx: dto.lastPx.toString(),
        commission: commission.toString(),
        grossAmount: grossAmount.toFixed(6),
        netAmount: netAmount.toFixed(6),
        currency: order.currency,
        lastMkt: dto.lastMkt ?? order.venue ?? null,
        counterpartyId: dto.counterpartyId ?? null,
        tradeDate,
        settlementType: dto.settlementType ?? SettlementType.REGULAR,
        settlementDate,
        settlementStatus: SettlementStatus.PENDING,
        transactTime: new Date(),
      });

      const savedExec = await manager.save(Execution, execution);

      // Update order (cumQty, leavesQty, avgPx, status)
      await this.ordersService.applyFill(dto.orderId, dto.lastQty, dto.lastPx);

      // Update position
      if (order.portfolioId) {
        await this.positionsService.applyExecution({
          portfolioId: order.portfolioId,
          instrumentId: order.instrumentId,
          side: order.side,
          qty: dto.lastQty,
          price: dto.lastPx,
          currency: order.currency,
        });
      }

      this.logger.log(
        `Fill recorded: ${savedExec.execId} | ${order.side} ${dto.lastQty} @ ${dto.lastPx} ` +
        `| order=${order.clOrdId}`,
      );

      return savedExec;
    });
  }

  async settle(executionId: string, journalId?: string): Promise<Execution> {
    const exec = await this.execRepo.findOne({ where: { id: executionId } });
    if (!exec) throw new NotFoundException(`Execution ${executionId} not found`);

    await this.execRepo.update(executionId, {
      settlementStatus: SettlementStatus.SETTLED,
      journalId: journalId ?? null,
    });

    return this.execRepo.findOneOrFail({ where: { id: executionId } });
  }

  async findByOrder(orderId: string): Promise<Execution[]> {
    return this.execRepo.find({
      where: { orderId },
      order: { transactTime: 'ASC' },
    });
  }

  async findPendingSettlement(): Promise<Execution[]> {
    return this.execRepo
      .createQueryBuilder('e')
      .where("e.settlement_status IN ('PENDING','AFFIRMED')")
      .andWhere('e.settlement_date <= CURRENT_DATE')
      .orderBy('e.settlement_date', 'ASC')
      .getMany();
  }

  async getTradingPnl(portfolioId: string, date?: Date): Promise<{
    realizedPnl: string;
    tradeCount: number;
    buyVolume: string;
    sellVolume: string;
  }> {
    const qb = this.execRepo
      .createQueryBuilder('e')
      .where("e.portfolioId = :pid", { pid: portfolioId })
      .andWhere("e.exec_type IN ('TRADE','FILL','PARTIAL_FILL')");

    if (date) {
      qb.andWhere('e.trade_date = :date', { date });
    }

    const executions = await qb.getMany();

    let buyVolume = 0;
    let sellVolume = 0;

    for (const exec of executions) {
      const notional = parseFloat(exec.grossAmount);
      if (exec.side === 'BUY') buyVolume += notional;
      else sellVolume += notional;
    }

    return {
      realizedPnl: (sellVolume - buyVolume).toFixed(2),
      tradeCount: executions.length,
      buyVolume: buyVolume.toFixed(2),
      sellVolume: sellVolume.toFixed(2),
    };
  }

  private calculateSettlementDate(tradeDate: Date, settlementType: SettlementType): Date {
    const d = new Date(tradeDate);
    const businessDays: Record<SettlementType, number> = {
      [SettlementType.CASH]: 0,
      [SettlementType.NEXT_DAY]: 1,
      [SettlementType.REGULAR]: 2,
      [SettlementType.T_PLUS_5]: 5,
      [SettlementType.FUTURE]: 5,
      [SettlementType.SELLER_OPTION]: 3,
    };
    const days = businessDays[settlementType] ?? 2;
    let count = 0;
    while (count < days) {
      d.setDate(d.getDate() + 1);
      if (d.getDay() !== 0 && d.getDay() !== 6) count++;
    }
    return d;
  }
}
