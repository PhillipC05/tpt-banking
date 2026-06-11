import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AchPayment, AchDirection, AchStatus, AccountStatus, JournalType, LedgerEntryType } from '@tpt/database';
import { JournalService } from '../../ledger/journal.service';
import { AccountsService } from '../../accounts/accounts.service';
import { PlaidService } from '../plaid/plaid.service';

export interface InitiateAchDto {
  accountId: string;
  customerId: string;
  direction: AchDirection;
  amount: number;
  currency?: string;
  description?: string;
  plaidAccessToken?: string;
  routingNumber?: string;
  externalAccountNumber?: string;
  externalAccountHolderName?: string;
  idempotencyKey: string;
}

@Injectable()
export class AchService {
  private readonly logger = new Logger(AchService.name);

  constructor(
    @InjectRepository(AchPayment)
    private readonly achRepo: Repository<AchPayment>,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
    private readonly plaidService: PlaidService,
  ) {}

  async initiate(dto: InitiateAchDto): Promise<AchPayment> {
    // Idempotency check
    const existing = await this.achRepo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return existing;

    const account = await this.accountsService.findByIdOrThrow(dto.accountId);
    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${dto.accountId} is not active`);
    }

    const amountStr = dto.amount.toFixed(6);

    // Validate sufficient funds for debit (outgoing ACH)
    if (dto.direction === AchDirection.DEBIT) {
      const balance = await this.accountsService.getBalance(dto.accountId);
      const available = parseFloat(balance.availableBalance);
      if (dto.amount > available) {
        throw new BadRequestException(
          `Insufficient available balance for ACH debit: requested ${dto.amount}, available ${available}`,
        );
      }
    }

    const payment = this.achRepo.create({
      accountId: dto.accountId,
      customerId: dto.customerId,
      direction: dto.direction,
      status: AchStatus.PENDING,
      amount: amountStr,
      currency: dto.currency ?? 'USD',
      description: dto.description ?? null,
      routingNumber: dto.routingNumber ?? null,
      externalAccountLast4: dto.externalAccountNumber?.slice(-4) ?? null,
      externalAccountHolderName: dto.externalAccountHolderName ?? null,
      idempotencyKey: dto.idempotencyKey,
      // ACH typically settles in 1-3 business days
      estimatedCompletion: this.estimateAchCompletion(),
    });

    const saved = await this.achRepo.save(payment);

    // Submit to Plaid (if access token provided)
    if (dto.plaidAccessToken) {
      try {
        const result = await this.plaidService.createPayment({
          accessToken: dto.plaidAccessToken,
          accountId: dto.accountId,
          amount: dto.amount,
          currency: dto.currency ?? 'USD',
          description: dto.description ?? 'ACH transfer',
        });
        await this.achRepo.update(saved.id, {
          plaidPaymentId: result.paymentId,
          status: AchStatus.SUBMITTED,
        });
      } catch (err) {
        this.logger.error(`Plaid submission failed for ACH ${saved.paymentReference}: ${err}`);
        await this.achRepo.update(saved.id, { status: AchStatus.FAILED });
        throw new BadRequestException('Failed to submit ACH payment to processor');
      }
    }

    return this.achRepo.findOneOrFail({ where: { id: saved.id } });
  }

  async complete(achId: string): Promise<AchPayment> {
    const payment = await this.findByIdOrThrow(achId);
    if (payment.status !== AchStatus.SUBMITTED && payment.status !== AchStatus.PENDING) {
      throw new BadRequestException(`ACH payment ${achId} is not in a submittable state`);
    }

    // Post ledger entry based on direction
    const entryType = payment.direction === AchDirection.CREDIT
      ? LedgerEntryType.CREDIT
      : LedgerEntryType.DEBIT;

    const journal = await this.journalService.postJournal({
      description: `ACH ${payment.direction} — ${payment.paymentReference}`,
      type: payment.direction === AchDirection.CREDIT ? JournalType.DEPOSIT : JournalType.WITHDRAWAL,
      reference: payment.paymentReference,
      idempotencyKey: `ach:complete:${payment.idempotencyKey}`,
      entries: [
        {
          accountId: payment.accountId,
          type: entryType,
          amount: payment.amount,
          currency: payment.currency,
          description: payment.description ?? `ACH ${payment.direction}`,
        },
      ],
    });

    await this.achRepo.update(achId, {
      status: AchStatus.COMPLETED,
      journalId: journal.id,
      completedAt: new Date(),
    });

    this.logger.log(`ACH payment ${payment.paymentReference} completed`);
    return this.findByIdOrThrow(achId);
  }

  async findById(id: string): Promise<AchPayment | null> {
    return this.achRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<AchPayment> {
    const payment = await this.findById(id);
    if (!payment) throw new NotFoundException(`ACH payment ${id} not found`);
    return payment;
  }

  async findByAccount(accountId: string): Promise<AchPayment[]> {
    return this.achRepo.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
    });
  }

  /** Creates a Plaid Link token for the frontend to link a bank account */
  async createLinkToken(userId: string): Promise<{ linkToken: string }> {
    const linkToken = await this.plaidService.createLinkToken(userId);
    return { linkToken };
  }

  /** Exchanges a Plaid public token after the user completes Link flow */
  async exchangePlaidToken(publicToken: string): Promise<{ accessTokenRef: string }> {
    const { accessToken, itemId } = await this.plaidService.exchangePublicToken(publicToken);
    // In production: encrypt and store the access token securely
    // Return a reference ID, not the actual token
    return { accessTokenRef: `plaid:${itemId}` };
  }

  private estimateAchCompletion(): Date {
    const d = new Date();
    d.setDate(d.getDate() + 3); // 3 business days
    return d;
  }
}
