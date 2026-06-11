import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  RtpPayment, RtpRail, RtpStatus, RtpDirection, AccountStatus,
  JournalType, LedgerEntryType,
} from '@tpt/database';
import { Money } from '@tpt/shared';
import { JournalService } from '../../ledger/journal.service';
import { AccountsService } from '../../accounts/accounts.service';

// TCH RTP per-transaction limit: $1,000,000
const TCH_RTP_LIMIT = 1_000_000;
// FedNow default per-transaction limit: $500,000 (can be raised to $1M)
const FED_NOW_LIMIT = 500_000;

export interface SendRtpDto {
  accountId: string;
  customerId: string;
  rail: RtpRail;
  amount: number;
  creditorName: string;
  creditorAccountNumber: string;
  creditorRoutingNumber: string;
  creditorBankName?: string;
  remittanceInfo?: string;
  purposeCode?: string;
  idempotencyKey: string;
}

@Injectable()
export class RtpService {
  private readonly logger = new Logger(RtpService.name);

  constructor(
    @InjectRepository(RtpPayment)
    private readonly rtpRepo: Repository<RtpPayment>,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
  ) {}

  async send(dto: SendRtpDto): Promise<RtpPayment> {
    // Idempotency
    const existing = await this.rtpRepo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return existing;

    // Rail-specific limits
    const limit = dto.rail === RtpRail.TCH_RTP ? TCH_RTP_LIMIT : FED_NOW_LIMIT;
    if (dto.amount > limit) {
      throw new BadRequestException(
        `Amount $${dto.amount.toLocaleString()} exceeds ${dto.rail} limit of $${limit.toLocaleString()}`,
      );
    }

    const account = await this.accountsService.findByIdOrThrow(dto.accountId);
    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${dto.accountId} is not active`);
    }
    if (account.currency !== 'USD') {
      throw new BadRequestException('RTP and FedNow are USD-only rails');
    }

    const balance = await this.accountsService.getBalance(dto.accountId);
    if (dto.amount > parseFloat(balance.availableBalance)) {
      throw new BadRequestException('Insufficient available balance for RTP payment');
    }

    const payment = this.rtpRepo.create({
      accountId: dto.accountId,
      customerId: dto.customerId,
      rail: dto.rail,
      direction: RtpDirection.CREDIT_PUSH,
      status: RtpStatus.PENDING,
      amount: dto.amount.toFixed(2),
      currency: 'USD',
      creditorName: dto.creditorName,
      creditorAccountNumber: dto.creditorAccountNumber,
      creditorRoutingNumber: dto.creditorRoutingNumber,
      creditorBankName: dto.creditorBankName ?? null,
      remittanceInfo: dto.remittanceInfo ?? null,
      purposeCode: dto.purposeCode ?? null,
      idempotencyKey: dto.idempotencyKey,
    });

    const saved = await this.rtpRepo.save(payment);

    // Simulate network submission (in production: call TCH RTP or FedNow API)
    await this.submitToNetwork(saved.id);

    return this.rtpRepo.findOneOrFail({ where: { id: saved.id } });
  }

  /**
   * Simulates submission to the RTP / FedNow network.
   * In production: integrate with TCH API or FedNow STP API using ISO 20022 pain.001.
   */
  private async submitToNetwork(paymentId: string): Promise<void> {
    const payment = await this.findByIdOrThrow(paymentId);

    await this.rtpRepo.update(paymentId, {
      status: RtpStatus.PROCESSING,
      submittedAt: new Date(),
      networkTransactionId: `NET${Date.now()}`,
    });

    // For real-time rails, settle immediately (simulated)
    await this.settle(paymentId);
  }

  async settle(paymentId: string): Promise<RtpPayment> {
    const payment = await this.findByIdOrThrow(paymentId);

    if (payment.status === RtpStatus.COMPLETED) return payment;

    const journal = await this.journalService.postJournal({
      description: `${payment.rail} payment to ${payment.creditorName} — ${payment.paymentReference}`,
      type: JournalType.WITHDRAWAL,
      reference: payment.paymentReference,
      idempotencyKey: `rtp:settle:${payment.idempotencyKey}`,
      entries: [
        {
          accountId: payment.accountId,
          type: LedgerEntryType.DEBIT,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.remittanceInfo ?? `${payment.rail} to ${payment.creditorName}`,
        },
      ],
    });

    await this.rtpRepo.update(paymentId, {
      status: RtpStatus.COMPLETED,
      journalId: journal.id,
      settledAt: new Date(),
    });

    this.logger.log(`${payment.rail} settled: ${payment.paymentReference} | $${payment.amount} to ${payment.creditorName}`);
    return this.findByIdOrThrow(paymentId);
  }

  async reject(paymentId: string, reasonCode: string, reason: string): Promise<RtpPayment> {
    await this.rtpRepo.update(paymentId, {
      status: RtpStatus.REJECTED,
      rejectionReasonCode: reasonCode,
      rejectionReason: reason,
    });
    return this.findByIdOrThrow(paymentId);
  }

  async findByIdOrThrow(id: string): Promise<RtpPayment> {
    const p = await this.rtpRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`RTP payment ${id} not found`);
    return p;
  }

  async findByAccount(accountId: string): Promise<RtpPayment[]> {
    return this.rtpRepo.find({ where: { accountId }, order: { createdAt: 'DESC' } });
  }
}
