import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Order, OrderSide, OrderType, TimeInForce, OrderStatus, OrderCapacity,
  Instrument, Portfolio, PortfolioStatus, Position,
} from '@tpt/database';
import { Money } from '@tpt/shared';

export interface PlaceOrderDto {
  instrumentId: string;
  portfolioId?: string;
  traderId: string;
  accountId?: string;
  side: OrderSide;
  orderType: OrderType;
  timeInForce?: TimeInForce;
  orderCapacity?: OrderCapacity;
  orderQty: number;
  price?: number;
  stopPrice?: number;
  currency: string;
  venue?: string;
  desk?: string;
  expireTime?: Date;
  text?: string;
}

export interface ModifyOrderDto {
  orderQty?: number;
  price?: number;
  stopPrice?: number;
  timeInForce?: TimeInForce;
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Instrument)
    private readonly instrumentRepo: Repository<Instrument>,
    @InjectRepository(Portfolio)
    private readonly portfolioRepo: Repository<Portfolio>,
    @InjectRepository(Position)
    private readonly positionRepo: Repository<Position>,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Place a new order through the OMS.
   * Runs pre-trade compliance checks before accepting the order.
   */
  async place(dto: PlaceOrderDto): Promise<Order> {
    // Validate instrument
    const instrument = await this.instrumentRepo.findOne({ where: { id: dto.instrumentId } });
    if (!instrument) throw new NotFoundException(`Instrument ${dto.instrumentId} not found`);
    if (instrument.instrumentStatus !== 'ACTIVE') {
      throw new BadRequestException(`Instrument ${instrument.ticker} is not active for trading`);
    }

    // Validate portfolio if provided
    if (dto.portfolioId) {
      const portfolio = await this.portfolioRepo.findOne({ where: { id: dto.portfolioId } });
      if (!portfolio || portfolio.status !== PortfolioStatus.ACTIVE) {
        throw new BadRequestException(`Portfolio ${dto.portfolioId} is not active`);
      }
    }

    // Pre-trade validation
    const complianceResult = await this.runPreTradeChecks(dto, instrument);

    // Validate limit/stop orders have prices
    if (dto.orderType === OrderType.LIMIT && !dto.price) {
      throw new BadRequestException('Limit orders require a price');
    }
    if ((dto.orderType === OrderType.STOP || dto.orderType === OrderType.STOP_LIMIT) && !dto.stopPrice) {
      throw new BadRequestException('Stop orders require a stop_price');
    }

    const order = this.orderRepo.create({
      instrumentId: dto.instrumentId,
      portfolioId: dto.portfolioId ?? null,
      traderId: dto.traderId,
      accountId: dto.accountId ?? null,
      side: dto.side,
      orderType: dto.orderType,
      timeInForce: dto.timeInForce ?? TimeInForce.DAY,
      orderCapacity: dto.orderCapacity ?? OrderCapacity.AGENCY,
      orderQty: dto.orderQty.toString(),
      leavesQty: dto.orderQty.toString(),
      cumQty: '0',
      price: dto.price?.toString() ?? null,
      stopPrice: dto.stopPrice?.toString() ?? null,
      currency: dto.currency.toUpperCase(),
      venue: dto.venue ?? null,
      desk: dto.desk ?? null,
      expireTime: dto.expireTime ?? null,
      text: dto.text ?? null,
      orderStatus: complianceResult.passed ? OrderStatus.NEW : OrderStatus.REJECTED,
      complianceChecked: true,
      complianceNotes: complianceResult.notes,
      rejectedReason: complianceResult.passed ? null : complianceResult.notes,
    });

    const saved = await this.orderRepo.save(order);

    if (!complianceResult.passed) {
      this.logger.warn(`Order ${saved.clOrdId} rejected by pre-trade compliance: ${complianceResult.notes}`);
    } else {
      this.logger.log(
        `Order ${saved.clOrdId} accepted: ${dto.side} ${dto.orderQty} ` +
        `${instrument.ticker ?? dto.instrumentId} @ ${dto.price ?? 'MKT'}`,
      );
    }

    return saved;
  }

  /**
   * Cancel an open order.
   */
  async cancel(orderId: string, reason?: string): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    const cancellableStatuses: OrderStatus[] = [
      OrderStatus.NEW,
      OrderStatus.PARTIALLY_FILLED,
      OrderStatus.PENDING_NEW,
    ];

    if (!cancellableStatuses.includes(order.orderStatus)) {
      throw new BadRequestException(
        `Order ${orderId} cannot be cancelled (status: ${order.orderStatus})`,
      );
    }

    await this.orderRepo.update(orderId, {
      orderStatus: OrderStatus.CANCELLED,
      leavesQty: '0',
      text: reason ?? order.text,
    });

    this.logger.log(`Order ${order.clOrdId} cancelled`);
    return this.findByIdOrThrow(orderId);
  }

  /**
   * Modify an existing open order (cancel/replace pattern — FIX standard).
   */
  async modify(orderId: string, dto: ModifyOrderDto): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    if (order.orderStatus !== OrderStatus.NEW && order.orderStatus !== OrderStatus.PARTIALLY_FILLED) {
      throw new BadRequestException(`Order ${orderId} is not open and cannot be modified`);
    }

    const updates: Partial<Order> = {};
    if (dto.orderQty !== undefined) {
      if (dto.orderQty <= parseFloat(order.cumQty)) {
        throw new BadRequestException('New quantity must be greater than already-filled quantity');
      }
      updates.orderQty = dto.orderQty.toString();
      updates.leavesQty = (dto.orderQty - parseFloat(order.cumQty)).toString();
    }
    if (dto.price !== undefined) updates.price = dto.price.toString();
    if (dto.stopPrice !== undefined) updates.stopPrice = dto.stopPrice.toString();
    if (dto.timeInForce !== undefined) updates.timeInForce = dto.timeInForce;

    await this.orderRepo.update(orderId, updates);
    return this.findByIdOrThrow(orderId);
  }

  /**
   * Update order state after an execution (fill) is received.
   * Called by ExecutionsService.
   */
  async applyFill(
    orderId: string,
    fillQty: number,
    fillPx: number,
  ): Promise<Order> {
    const order = await this.findByIdOrThrow(orderId);

    const newCumQty = parseFloat(order.cumQty) + fillQty;
    const newLeavesQty = parseFloat(order.orderQty) - newCumQty;

    // Weighted average price
    const prevAvgPx = parseFloat(order.avgPx ?? '0');
    const prevCumQty = parseFloat(order.cumQty);
    const newAvgPx = prevCumQty === 0
      ? fillPx
      : ((prevAvgPx * prevCumQty) + (fillPx * fillQty)) / newCumQty;

    const isFilled = newLeavesQty <= 0;
    const newStatus = isFilled ? OrderStatus.FILLED : OrderStatus.PARTIALLY_FILLED;

    await this.orderRepo.update(orderId, {
      cumQty: newCumQty.toFixed(6),
      leavesQty: Math.max(0, newLeavesQty).toFixed(6),
      avgPx: newAvgPx.toFixed(6),
      orderStatus: newStatus,
    });

    return this.findByIdOrThrow(orderId);
  }

  async findByIdOrThrow(id: string): Promise<Order> {
    const order = await this.orderRepo.findOne({ where: { id } });
    if (!order) throw new NotFoundException(`Order ${id} not found`);
    return order;
  }

  async findByClOrdId(clOrdId: string): Promise<Order | null> {
    return this.orderRepo.findOne({ where: { clOrdId } });
  }

  async findOpenOrders(filters?: {
    portfolioId?: string;
    instrumentId?: string;
    traderId?: string;
  }): Promise<Order[]> {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .where("o.order_status IN ('NEW','PARTIALLY_FILLED','PENDING_NEW')")
      .orderBy('o.transact_time', 'DESC');
    if (filters?.portfolioId) qb.andWhere('o.portfolioId = :pid', { pid: filters.portfolioId });
    if (filters?.instrumentId) qb.andWhere('o.instrumentId = :iid', { iid: filters.instrumentId });
    if (filters?.traderId) qb.andWhere('o.traderId = :tid', { tid: filters.traderId });
    return qb.getMany();
  }

  async getBlotter(
    filters?: { date?: Date; portfolioId?: string; desk?: string },
    limit = 200,
  ): Promise<Order[]> {
    const qb = this.orderRepo
      .createQueryBuilder('o')
      .orderBy('o.transact_time', 'DESC')
      .limit(limit);

    if (filters?.date) {
      const start = new Date(filters.date);
      start.setHours(0, 0, 0, 0);
      const end = new Date(filters.date);
      end.setHours(23, 59, 59, 999);
      qb.andWhere('o.transact_time BETWEEN :start AND :end', { start, end });
    }
    if (filters?.portfolioId) qb.andWhere('o.portfolioId = :pid', { pid: filters.portfolioId });
    if (filters?.desk) qb.andWhere('o.desk = :desk', { desk: filters.desk });

    return qb.getMany();
  }

  // ─── Pre-trade compliance checks ─────────────────────────────────────────

  private async runPreTradeChecks(
    dto: PlaceOrderDto,
    instrument: Instrument,
  ): Promise<{ passed: boolean; notes: string }> {
    const issues: string[] = [];

    // Check minimum lot size
    const lotSize = parseFloat(instrument.lotSize);
    if (dto.orderQty % lotSize !== 0) {
      issues.push(`Order quantity ${dto.orderQty} is not a multiple of lot size ${lotSize}`);
    }

    // Short sell check — need existing position to short
    if (dto.side === OrderSide.SELL_SHORT && dto.portfolioId) {
      const position = await this.positionRepo.findOne({
        where: { portfolioId: dto.portfolioId, instrumentId: dto.instrumentId },
      });
      const currentQty = parseFloat(position?.quantity ?? '0');
      if (currentQty < dto.orderQty) {
        // Not strictly blocking (allow synthetic shorts) but flag it
        issues.push(`Short sell of ${dto.orderQty} but portfolio holds only ${currentQty} — naked short pending locate`);
      }
    }

    // Sanity check prices
    if (dto.price && dto.price <= 0) issues.push('Limit price must be positive');
    if (dto.stopPrice && dto.stopPrice <= 0) issues.push('Stop price must be positive');

    const passed = issues.length === 0;
    return { passed, notes: issues.join('; ') };
  }
}
