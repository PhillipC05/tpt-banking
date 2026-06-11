import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ctr, CtrStatus } from '@tpt/database';

const CTR_THRESHOLD_USD = 10_000;
const CTR_DEADLINE_DAYS = 15;

export interface CreateCtrDto {
  customerId: string;
  accountId: string;
  transactionId?: string;
  cashAmount: number;
  transactionDate: Date;
  transactionType: 'DEPOSIT' | 'WITHDRAWAL';
  conductorInfo: {
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    ssn?: string;
    address?: string;
    idType?: string;
    idNumber?: string;
  };
  beneficiaryInfo?: Record<string, unknown>;
}

/**
 * CTR (Currency Transaction Report) service.
 * Automatically triggered for cash transactions > $10,000 USD.
 * Must be filed with FinCEN within 15 days.
 * 31 CFR § 1010.311
 */
@Injectable()
export class CtrService {
  private readonly logger = new Logger(CtrService.name);

  constructor(
    @InjectRepository(Ctr)
    private readonly ctrRepo: Repository<Ctr>,
  ) {}

  /**
   * Creates a CTR for a qualifying cash transaction.
   * Call this automatically when a cash deposit/withdrawal > $10K is processed.
   */
  async createForTransaction(dto: CreateCtrDto): Promise<Ctr> {
    if (dto.cashAmount <= CTR_THRESHOLD_USD) {
      throw new BadRequestException(
        `CTR is only required for cash transactions exceeding $${CTR_THRESHOLD_USD.toLocaleString()}`,
      );
    }

    const deadline = new Date(dto.transactionDate);
    deadline.setDate(deadline.getDate() + CTR_DEADLINE_DAYS);

    const ctr = this.ctrRepo.create({
      customerId: dto.customerId,
      accountId: dto.accountId,
      transactionId: dto.transactionId ?? null,
      cashAmount: dto.cashAmount.toFixed(2),
      transactionDate: dto.transactionDate,
      transactionType: dto.transactionType,
      conductorInfo: dto.conductorInfo,
      beneficiaryInfo: dto.beneficiaryInfo ?? null,
      status: CtrStatus.PENDING,
      deadline,
    });

    const saved = await this.ctrRepo.save(ctr);
    this.logger.log(
      `CTR created: ${saved.ctrNumber} | amount=$${dto.cashAmount} | deadline=${deadline.toISOString().split('T')[0]}`,
    );
    return saved;
  }

  /**
   * File the CTR with FinCEN.
   * In production this calls FinCEN BSA E-Filing API.
   */
  async file(ctrId: string, filerUserId: string): Promise<Ctr> {
    const ctr = await this.findByIdOrThrow(ctrId);
    if (ctr.status !== CtrStatus.PENDING) {
      throw new BadRequestException(`CTR ${ctrId} has already been filed or is not pending`);
    }

    // TODO: Integrate with FinCEN BSA E-Filing API
    const mockBsaId = `CTR-BSA-${Date.now()}`;

    await this.ctrRepo.update(ctrId, {
      status: CtrStatus.FILED,
      fincenBsaId: mockBsaId,
      filedAt: new Date(),
      filedByUserId: filerUserId,
    });

    this.logger.log(`CTR ${ctr.ctrNumber} filed with FinCEN. BSA ID: ${mockBsaId}`);
    return this.findByIdOrThrow(ctrId);
  }

  async findByIdOrThrow(id: string): Promise<Ctr> {
    const ctr = await this.ctrRepo.findOne({ where: { id } });
    if (!ctr) throw new NotFoundException(`CTR ${id} not found`);
    return ctr;
  }

  async findPending(): Promise<Ctr[]> {
    return this.ctrRepo.find({
      where: { status: CtrStatus.PENDING },
      order: { deadline: 'ASC' },
    });
  }

  async findOverdue(): Promise<Ctr[]> {
    return this.ctrRepo
      .createQueryBuilder('ctr')
      .where("ctr.status = 'PENDING'")
      .andWhere('ctr.deadline < NOW()')
      .orderBy('ctr.deadline', 'ASC')
      .getMany();
  }

  /** Check if a cash transaction requires a CTR */
  static requiresCtr(amountUsd: number): boolean {
    return amountUsd > CTR_THRESHOLD_USD;
  }
}
