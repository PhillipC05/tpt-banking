import {
  BadRequestException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  SepaPayment, SepaScheme, SepaStatus, AccountStatus,
  JournalType, LedgerEntryType,
} from '@tpt/database';
import { JournalService } from '../../ledger/journal.service';
import { AccountsService } from '../../accounts/accounts.service';

const SEPA_INST_LIMIT_EUR = 100_000;

export interface SendSepaDto {
  accountId: string;
  customerId: string;
  scheme: SepaScheme;
  amount: number;
  debtorName: string;
  debtorIban: string;
  debtorBic?: string;
  creditorName: string;
  creditorIban: string;
  creditorBic?: string;
  creditorBankName?: string;
  creditorAddress?: string;
  creditorCountry?: string;
  remittanceInfo?: string;
  purposeCode?: string;
  categoryPurpose?: string;
  executionDate?: Date;
  idempotencyKey: string;
}

/**
 * SEPA payment service.
 * Covers SCT (standard credit transfer, 1-2 business days),
 * SCT Inst (instant, 10-second SLA, max €100,000), and SDD Core (direct debit).
 */
@Injectable()
export class SepaService {
  private readonly logger = new Logger(SepaService.name);

  constructor(
    @InjectRepository(SepaPayment)
    private readonly sepaRepo: Repository<SepaPayment>,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
  ) {}

  async send(dto: SendSepaDto): Promise<SepaPayment> {
    const existing = await this.sepaRepo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return existing;

    if (dto.scheme === SepaScheme.SCT_INST && dto.amount > SEPA_INST_LIMIT_EUR) {
      throw new BadRequestException(
        `SCT Inst limit is €${SEPA_INST_LIMIT_EUR.toLocaleString()}. Use SCT for higher amounts.`,
      );
    }

    const account = await this.accountsService.findByIdOrThrow(dto.accountId);
    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${dto.accountId} is not active`);
    }

    if (!this.validateIban(dto.creditorIban)) {
      throw new BadRequestException(`Invalid creditor IBAN: ${dto.creditorIban}`);
    }

    const balance = await this.accountsService.getBalance(dto.accountId);
    if (dto.amount > parseFloat(balance.availableBalance)) {
      throw new BadRequestException('Insufficient available balance for SEPA payment');
    }

    const payment = this.sepaRepo.create({
      accountId: dto.accountId,
      customerId: dto.customerId,
      scheme: dto.scheme,
      status: SepaStatus.PENDING,
      amount: dto.amount.toFixed(2),
      currency: 'EUR',
      debtorName: dto.debtorName,
      debtorIban: dto.debtorIban.replace(/\s/g, '').toUpperCase(),
      debtorBic: dto.debtorBic?.toUpperCase() ?? null,
      creditorName: dto.creditorName,
      creditorIban: dto.creditorIban.replace(/\s/g, '').toUpperCase(),
      creditorBic: dto.creditorBic?.toUpperCase() ?? null,
      creditorBankName: dto.creditorBankName ?? null,
      creditorAddress: dto.creditorAddress ?? null,
      creditorCountry: dto.creditorCountry?.toUpperCase() ?? null,
      remittanceInfo: dto.remittanceInfo ?? null,
      purposeCode: dto.purposeCode ?? null,
      categoryPurpose: dto.categoryPurpose ?? null,
      executionDate: dto.executionDate ?? null,
      idempotencyKey: dto.idempotencyKey,
    });

    const saved = await this.sepaRepo.save(payment);

    // SCT Inst: immediate submission and settlement simulation
    if (dto.scheme === SepaScheme.SCT_INST) {
      await this.submitAndSettle(saved.id);
    } else {
      // SCT: mark as submitted (settles on next business day)
      await this.sepaRepo.update(saved.id, {
        status: SepaStatus.ACCEPTED,
        submittedAt: new Date(),
        networkTransactionId: `SEPA${Date.now()}`,
      });
    }

    return this.sepaRepo.findOneOrFail({ where: { id: saved.id } });
  }

  private async submitAndSettle(paymentId: string): Promise<void> {
    const payment = await this.findByIdOrThrow(paymentId);

    await this.sepaRepo.update(paymentId, {
      status: SepaStatus.PROCESSING,
      submittedAt: new Date(),
      networkTransactionId: `SEPA_INST_${Date.now()}`,
    });

    const journal = await this.journalService.postJournal({
      description: `SEPA ${payment.scheme} to ${payment.creditorName} — ${payment.paymentReference}`,
      type: JournalType.WITHDRAWAL,
      reference: payment.paymentReference,
      idempotencyKey: `sepa:settle:${payment.idempotencyKey}`,
      entries: [
        {
          accountId: payment.accountId,
          type: LedgerEntryType.DEBIT,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.remittanceInfo ?? `SEPA to ${payment.creditorName}`,
        },
      ],
    });

    await this.sepaRepo.update(paymentId, {
      status: SepaStatus.COMPLETED,
      journalId: journal.id,
      settledAt: new Date(),
    });

    this.logger.log(`SEPA ${payment.scheme} settled: ${payment.paymentReference} | €${payment.amount} to ${payment.creditorName}`);
  }

  async settle(paymentId: string): Promise<SepaPayment> {
    await this.submitAndSettle(paymentId);
    return this.findByIdOrThrow(paymentId);
  }

  async findByIdOrThrow(id: string): Promise<SepaPayment> {
    const p = await this.sepaRepo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`SEPA payment ${id} not found`);
    return p;
  }

  async findByAccount(accountId: string): Promise<SepaPayment[]> {
    return this.sepaRepo.find({ where: { accountId }, order: { createdAt: 'DESC' } });
  }

  /** Basic IBAN format validation */
  private validateIban(iban: string): boolean {
    const cleaned = iban.replace(/\s/g, '').toUpperCase();
    return /^[A-Z]{2}[0-9]{2}[A-Z0-9]{4,30}$/.test(cleaned);
  }
}
