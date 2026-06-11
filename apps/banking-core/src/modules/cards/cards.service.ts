import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Card,
  CardStatus,
  CardType,
  CardNetwork,
  CardTransaction,
  CardTransactionStatus,
  CardTransactionType,
  AccountStatus,
  JournalType,
  LedgerEntryType,
} from '@tpt/database';
import { Money } from '@tpt/shared';
import { StripeIssuingService } from './stripe-issuing.service';
import { JournalService } from '../ledger/journal.service';
import { AccountsService } from '../accounts/accounts.service';
import { CustomersService } from '../customers/customers.service';

export interface IssueCardDto {
  customerId: string;
  accountId: string;
  type: CardType;
  network?: CardNetwork;
  virtualOnly?: boolean;
  spendingLimitDaily?: number;
  spendingLimitMonthly?: number;
  creditLimit?: number;
  apr?: number;
}

@Injectable()
export class CardsService {
  private readonly logger = new Logger(CardsService.name);

  constructor(
    @InjectRepository(Card)
    private readonly cardsRepo: Repository<Card>,
    @InjectRepository(CardTransaction)
    private readonly cardTxnRepo: Repository<CardTransaction>,
    private readonly stripeIssuingService: StripeIssuingService,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
    private readonly customersService: CustomersService,
  ) {}

  async issue(dto: IssueCardDto): Promise<Card> {
    const customer = await this.customersService.findByIdOrThrow(dto.customerId);
    const account = await this.accountsService.findByIdOrThrow(dto.accountId);

    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${dto.accountId} must be active to issue a card`);
    }

    // Create Stripe cardholder (using customer's name + placeholder address for sandbox)
    const { cardholderId } = await this.stripeIssuingService.createCardholder({
      name: customer.fullName,
      email: customer.email,
      billingAddress: {
        line1: '123 Main St',
        city: 'New York',
        state: 'NY',
        postalCode: '10001',
        country: 'US',
      },
    });

    const spendingLimits = [];
    if (dto.spendingLimitDaily) {
      spendingLimits.push({ amount: dto.spendingLimitDaily, interval: 'daily' as const });
    }
    if (dto.spendingLimitMonthly) {
      spendingLimits.push({ amount: dto.spendingLimitMonthly, interval: 'monthly' as const });
    }

    const stripeCard = await this.stripeIssuingService.issueCard({
      cardholderId,
      type: dto.type,
      currency: account.currency,
      spendingLimits: spendingLimits.length > 0 ? spendingLimits : undefined,
    });

    const card = this.cardsRepo.create({
      customerId: dto.customerId,
      accountId: dto.accountId,
      type: dto.type,
      status: CardStatus.ACTIVE,
      network: (stripeCard.network as CardNetwork) ?? dto.network ?? CardNetwork.VISA,
      stripeCardId: stripeCard.stripeCardId,
      lastFour: stripeCard.lastFour,
      cardHolderName: customer.fullName,
      expiryMonth: stripeCard.expiryMonth,
      expiryYear: stripeCard.expiryYear,
      virtualOnly: dto.virtualOnly ?? false,
      spendingLimitDaily: dto.spendingLimitDaily?.toFixed(6) ?? null,
      spendingLimitMonthly: dto.spendingLimitMonthly?.toFixed(6) ?? null,
      creditLimit: dto.creditLimit?.toFixed(6) ?? null,
      availableCredit: dto.creditLimit?.toFixed(6) ?? null,
      apr: dto.apr?.toFixed(6) ?? null,
      issuedAt: new Date(),
    });

    const saved = await this.cardsRepo.save(card);
    this.logger.log(`Card issued: ${saved.type} ****${saved.lastFour} for customer ${dto.customerId}`);
    return saved;
  }

  async freeze(cardId: string): Promise<Card> {
    const card = await this.findByIdOrThrow(cardId);
    if (card.status !== CardStatus.ACTIVE) {
      throw new BadRequestException('Only active cards can be frozen');
    }
    if (card.stripeCardId) await this.stripeIssuingService.freezeCard(card.stripeCardId);
    await this.cardsRepo.update(cardId, { status: CardStatus.FROZEN });
    return this.findByIdOrThrow(cardId);
  }

  async unfreeze(cardId: string): Promise<Card> {
    const card = await this.findByIdOrThrow(cardId);
    if (card.status !== CardStatus.FROZEN) {
      throw new BadRequestException('Only frozen cards can be unfrozen');
    }
    if (card.stripeCardId) await this.stripeIssuingService.unfreezeCard(card.stripeCardId);
    await this.cardsRepo.update(cardId, { status: CardStatus.ACTIVE });
    return this.findByIdOrThrow(cardId);
  }

  async cancel(cardId: string, reason: 'LOST' | 'STOLEN' | 'CANCELLED'): Promise<Card> {
    const card = await this.findByIdOrThrow(cardId);
    if (card.status === CardStatus.CANCELLED) {
      throw new BadRequestException('Card is already cancelled');
    }
    if (card.stripeCardId) await this.stripeIssuingService.cancelCard(card.stripeCardId);
    await this.cardsRepo.update(cardId, {
      status: reason === 'LOST' ? CardStatus.LOST : reason === 'STOLEN' ? CardStatus.STOLEN : CardStatus.CANCELLED,
      cancelledAt: new Date(),
    });
    return this.findByIdOrThrow(cardId);
  }

  /**
   * Processes a card authorization (called from Stripe webhook).
   * Checks available balance and approves or declines.
   */
  async processAuthorization(
    stripeAuthId: string,
    stripeCardId: string,
    amount: number,
    currency: string,
    merchantName: string,
    merchantCategory: string,
  ): Promise<{ approved: boolean; reason?: string }> {
    const card = await this.cardsRepo.findOne({ where: { stripeCardId } });
    if (!card || card.status !== CardStatus.ACTIVE) {
      if (card?.stripeCardId) await this.stripeIssuingService.declineAuthorization(stripeAuthId);
      return { approved: false, reason: 'Card not active' };
    }

    const account = await this.accountsService.findByIdOrThrow(card.accountId);
    const available = parseFloat(account.availableBalance);

    if (amount > available) {
      await this.stripeIssuingService.declineAuthorization(stripeAuthId);

      await this.cardTxnRepo.save(this.cardTxnRepo.create({
        cardId: card.id,
        accountId: card.accountId,
        stripeAuthorizationId: stripeAuthId,
        type: CardTransactionType.PURCHASE,
        status: CardTransactionStatus.DECLINED,
        amount: amount.toFixed(6),
        currency,
        merchantName,
        merchantCategory,
        declineReason: 'INSUFFICIENT_FUNDS',
      }));

      return { approved: false, reason: 'Insufficient funds' };
    }

    // Approve and place hold
    await this.stripeIssuingService.approveAuthorization(stripeAuthId);
    await this.accountsService.placeHold(card.accountId, amount.toFixed(6), currency);

    await this.cardTxnRepo.save(this.cardTxnRepo.create({
      cardId: card.id,
      accountId: card.accountId,
      stripeAuthorizationId: stripeAuthId,
      type: CardTransactionType.PURCHASE,
      status: CardTransactionStatus.AUTHORIZED,
      amount: amount.toFixed(6),
      currency,
      merchantName,
      merchantCategory,
      authorizedAt: new Date(),
    }));

    return { approved: true };
  }

  /**
   * Clears a previously authorized transaction (called from Stripe webhook).
   */
  async clearTransaction(stripeAuthId: string, finalAmount: number): Promise<void> {
    const txn = await this.cardTxnRepo.findOne({
      where: { stripeAuthorizationId: stripeAuthId },
    });
    if (!txn) return;

    const card = await this.findByIdOrThrow(txn.cardId);

    // Release original hold, post journal for final amount
    await this.accountsService.releaseHold(card.accountId, txn.amount, txn.currency);

    const journal = await this.journalService.postJournal({
      description: `Card purchase — ${txn.merchantName ?? 'Merchant'}`,
      type: JournalType.WITHDRAWAL,
      reference: stripeAuthId,
      idempotencyKey: `card:clear:${stripeAuthId}`,
      entries: [
        {
          accountId: card.accountId,
          type: LedgerEntryType.DEBIT,
          amount: finalAmount.toFixed(6),
          currency: txn.currency,
          description: txn.merchantName ?? 'Card purchase',
        },
      ],
    });

    await this.cardTxnRepo.update(txn.id, {
      status: CardTransactionStatus.CLEARED,
      amount: finalAmount.toFixed(6),
      journalId: journal.id,
      clearedAt: new Date(),
    });
  }

  async findById(id: string): Promise<Card | null> {
    return this.cardsRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<Card> {
    const card = await this.findById(id);
    if (!card) throw new NotFoundException(`Card ${id} not found`);
    return card;
  }

  async findByCustomer(customerId: string): Promise<Card[]> {
    return this.cardsRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async getTransactions(cardId: string): Promise<CardTransaction[]> {
    return this.cardTxnRepo.find({
      where: { cardId },
      order: { createdAt: 'DESC' },
    });
  }
}
