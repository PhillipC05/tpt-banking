import { Injectable, Logger, UnauthorizedException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  OpenBankingConsent, ConsentStatus, ConsentType, Account, LedgerEntry,
} from '@tpt/database';
import { Money } from '@tpt/shared';
import { OAuth2Service } from '../oauth2/oauth2.service';
import { PaymentBridgeService } from './payment-bridge.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';

/**
 * UK OBIE v3.1 resource server.
 * Formats responses per the OBIE data model specification.
 */
@Injectable()
export class ObieService {
  private readonly logger = new Logger(ObieService.name);

  constructor(
    @InjectRepository(OpenBankingConsent)
    private readonly consentRepo: Repository<OpenBankingConsent>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    private readonly oauth2Service: OAuth2Service,
    private readonly paymentBridge: PaymentBridgeService,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  private async resolveTokenToConsent(authHeader: string): Promise<OpenBankingConsent> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    // In production: call oauth2Service.introspectToken with the client_id from the request
    // For now we look up the token in consent by opaque token stored in Redis
    const introspection = await this.oauth2Service.introspectToken(token, '*');
    if (!introspection.active || !introspection.consent_id) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const consent = await this.consentRepo.findOne({
      where: { consentId: introspection.consent_id },
    });
    if (!consent || consent.status !== ConsentStatus.AUTHORISED) {
      throw new UnauthorizedException('Consent not active');
    }
    return consent;
  }

  async createAccountConsent(
    authHeader: string,
    body: { Data: { Permissions: string[]; ExpirationDateTime?: string; TransactionFromDateTime?: string; TransactionToDateTime?: string }; Risk: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    // Client credentials flow — create consent before PSU auth
    const consent = this.consentRepo.create({
      type: ConsentType.ACCOUNT_ACCESS,
      status: ConsentStatus.AWAITING_AUTHORISATION,
      permissions: body.Data.Permissions,
      expiresAt: body.Data.ExpirationDateTime ? new Date(body.Data.ExpirationDateTime) : null,
      transactionFromDate: body.Data.TransactionFromDateTime ? new Date(body.Data.TransactionFromDateTime) : null,
      transactionToDate: body.Data.TransactionToDateTime ? new Date(body.Data.TransactionToDateTime) : null,
      riskData: body.Risk,
      clientId: 'pending', // Set when token is resolved
    });

    const saved = await this.consentRepo.save(consent);

    return {
      Data: {
        ConsentId: saved.consentId,
        Status: 'AwaitingAuthorisation',
        CreationDateTime: saved.createdAt.toISOString(),
        StatusUpdateDateTime: saved.updatedAt.toISOString(),
        Permissions: saved.permissions,
        ExpirationDateTime: saved.expiresAt?.toISOString(),
      },
      Risk: body.Risk,
      Links: { Self: `/open-banking/v3.1/aisp/account-access-consents/${saved.consentId}` },
      Meta: {},
    };
  }

  async getConsentStatus(consentId: string): Promise<Record<string, unknown>> {
    const consent = await this.consentRepo.findOne({ where: { consentId } });
    if (!consent) throw new UnauthorizedException(`Consent ${consentId} not found`);

    const statusMap: Record<ConsentStatus, string> = {
      [ConsentStatus.AWAITING_AUTHORISATION]: 'AwaitingAuthorisation',
      [ConsentStatus.AUTHORISED]: 'Authorised',
      [ConsentStatus.REJECTED]: 'Rejected',
      [ConsentStatus.REVOKED]: 'Revoked',
      [ConsentStatus.EXPIRED]: 'Expired',
    };

    return {
      Data: {
        ConsentId: consent.consentId,
        Status: statusMap[consent.status] ?? consent.status,
        CreationDateTime: consent.createdAt.toISOString(),
        StatusUpdateDateTime: consent.updatedAt.toISOString(),
        Permissions: consent.permissions,
      },
      Links: { Self: `/open-banking/v3.1/aisp/account-access-consents/${consentId}` },
      Meta: {},
    };
  }

  async getAccounts(authHeader: string): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authHeader);
    if (!consent.permissions.includes('ReadAccountsBasic') && !consent.permissions.includes('accounts')) {
      throw new UnauthorizedException('Missing ReadAccountsBasic permission');
    }

    const accountIds = consent.authorisedAccountIds;
    const accounts = accountIds.length > 0
      ? await this.accountRepo.findByIds(accountIds)
      : await this.accountRepo.find({ where: { customerId: consent.customerId! } });

    return {
      Data: {
        Account: accounts.map((a) => this.formatAccountObie(a)),
      },
      Links: { Self: '/open-banking/v3.1/aisp/accounts' },
      Meta: { TotalPages: 1 },
    };
  }

  async getAccount(authHeader: string, accountId: string): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authHeader);
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException(`Account not found`);

    return {
      Data: { Account: [this.formatAccountObie(account)] },
      Links: { Self: `/open-banking/v3.1/aisp/accounts/${accountId}` },
      Meta: {},
    };
  }

  async getBalances(authHeader: string, accountId: string): Promise<Record<string, unknown>> {
    await this.resolveTokenToConsent(authHeader);
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new UnauthorizedException(`Account not found`);

    const balance = Money.fromDecimalString(account.balance, account.currency);
    const available = Money.fromDecimalString(account.availableBalance, account.currency);

    return {
      Data: {
        Balance: [
          {
            AccountId: accountId,
            Amount: { Amount: balance.toDecimalString(), Currency: account.currency },
            CreditDebitIndicator: balance.isNegative() ? 'Debit' : 'Credit',
            Type: 'ClosingBooked',
            DateTime: new Date().toISOString(),
          },
          {
            AccountId: accountId,
            Amount: { Amount: available.toDecimalString(), Currency: account.currency },
            CreditDebitIndicator: available.isNegative() ? 'Debit' : 'Credit',
            Type: 'InterimAvailable',
            DateTime: new Date().toISOString(),
          },
        ],
      },
      Links: { Self: `/open-banking/v3.1/aisp/accounts/${accountId}/balances` },
      Meta: {},
    };
  }

  async getTransactions(
    authHeader: string,
    accountId: string,
    from?: string,
    to?: string,
  ): Promise<Record<string, unknown>> {
    await this.resolveTokenToConsent(authHeader);

    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.journal', 'journal')
      .where('entry.accountId = :accountId', { accountId })
      .orderBy('entry.createdAt', 'DESC')
      .limit(200);

    if (from) qb.andWhere('entry.createdAt >= :from', { from: new Date(from) });
    if (to) qb.andWhere('entry.createdAt <= :to', { to: new Date(to) });

    const entries = await qb.getMany();
    const account = await this.accountRepo.findOne({ where: { id: accountId } });

    return {
      Data: {
        Transaction: entries.map((e) => ({
          AccountId: accountId,
          TransactionId: e.id,
          Amount: {
            Amount: e.amount,
            Currency: e.currency,
          },
          CreditDebitIndicator: e.type === 'CREDIT' ? 'Credit' : 'Debit',
          Status: 'Booked',
          BookingDateTime: e.createdAt.toISOString(),
          TransactionInformation: e.description ?? '',
          Balance: {
            Amount: { Amount: e.balanceAfter, Currency: e.currency },
            CreditDebitIndicator: parseFloat(e.balanceAfter) >= 0 ? 'Credit' : 'Debit',
            Type: 'InterimBooked',
          },
        })),
      },
      Links: { Self: `/open-banking/v3.1/aisp/accounts/${accountId}/transactions` },
      Meta: { TotalPages: 1 },
    };
  }

  async createPaymentConsent(
    authHeader: string,
    body: { Data: { Initiation: Record<string, unknown> }; Risk: Record<string, unknown> },
  ): Promise<Record<string, unknown>> {
    const consent = this.consentRepo.create({
      type: ConsentType.DOMESTIC_PAYMENT,
      status: ConsentStatus.AWAITING_AUTHORISATION,
      permissions: ['payments'],
      paymentDetails: body.Data.Initiation,
      riskData: body.Risk,
      clientId: 'pending',
    });
    const saved = await this.consentRepo.save(consent);

    return {
      Data: {
        ConsentId: saved.consentId,
        Status: 'AwaitingAuthorisation',
        CreationDateTime: saved.createdAt.toISOString(),
        StatusUpdateDateTime: saved.updatedAt.toISOString(),
        Initiation: body.Data.Initiation,
      },
      Risk: body.Risk,
      Links: { Self: `/open-banking/v3.1/pisp/domestic-payment-consents/${saved.consentId}` },
      Meta: {},
    };
  }

  async submitPayment(
    authHeader: string,
    idempotencyKey: string,
    body: {
      Data: {
        ConsentId: string;
        Initiation: {
          InstructedAmount: { Amount: string; Currency: string };
          CreditorAccount:  { Identification: string; Name?: string };
          CreditorName?:    string;
          RemittanceInformation?: { Reference?: string; Unstructured?: string };
        };
      };
      Risk: Record<string, unknown>;
    },
  ): Promise<Record<string, unknown>> {
    await this.resolveTokenToConsent(authHeader);

    const { obPaymentId, status } = await this.paymentBridge.submitDomesticPayment(
      { consentId: body.Data.ConsentId, initiation: body.Data.Initiation },
      idempotencyKey,
    );

    // Async notification — does not block response
    void this.webhookDelivery.queueDelivery('payment.pending', {
      paymentId: obPaymentId,
      consentId: body.Data.ConsentId,
      status,
    });

    return {
      Data: {
        DomesticPaymentId:   obPaymentId,
        ConsentId:           body.Data.ConsentId,
        Status:              status,
        CreationDateTime:    new Date().toISOString(),
        StatusUpdateDateTime: new Date().toISOString(),
        Initiation:          body.Data.Initiation,
      },
      Links: { Self: `/open-banking/v3.1/pisp/domestic-payments/${obPaymentId}` },
      Meta: {},
    };
  }

  async getPaymentStatus(paymentId: string): Promise<Record<string, unknown>> {
    const status = await this.paymentBridge.getPaymentStatus(paymentId);
    return {
      Data: {
        DomesticPaymentId:    paymentId,
        Status:               status,
        StatusUpdateDateTime: new Date().toISOString(),
      },
      Links: { Self: `/open-banking/v3.1/pisp/domestic-payments/${paymentId}` },
      Meta: {},
    };
  }

  // ── Confirmation of Funds (OBIE CBPII / PSD2 Art.65) ─────────────────────

  async confirmFunds(
    authHeader: string,
    body: {
      Data: {
        ConsentId:       string;
        Reference:       string;
        InstructedAmount: { Amount: string; Currency: string };
      };
    },
  ): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authHeader);

    if (!consent.permissions.includes('ReadFundsConfirmations') &&
        !consent.permissions.includes('payments')) {
      throw new BadRequestException('Consent does not include ReadFundsConfirmations permission');
    }

    const requested = new Money(
      body.Data.InstructedAmount.Amount,
      body.Data.InstructedAmount.Currency,
    );

    const accountId = consent.authorisedAccountIds?.[0];
    if (!accountId) {
      throw new BadRequestException('No authorised account on consent');
    }

    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) {
      throw new BadRequestException('Authorised account not found');
    }

    const available = Money.fromDecimalString(account.availableBalance, account.currency);
    const fundsAvailable = available.amount.gte(requested.amount);

    return {
      Data: {
        FundsAvailableResult: {
          FundsAvailable: fundsAvailable,
          FundsAvailableDateTime: new Date().toISOString(),
          Reference: body.Data.Reference,
        },
      },
      Links: { Self: '/open-banking/v3.1/cbpii/funds-confirmations' },
      Meta: {},
    };
  }

  private formatAccountObie(account: Account): Record<string, unknown> {
    return {
      AccountId: account.id,
      Status: account.status,
      Currency: account.currency,
      AccountType: account.type === 'CHECKING' ? 'Personal' : 'Business',
      AccountSubType: this.mapAccountSubType(account.type),
      OpeningDate: account.openedAt?.toISOString(),
      Account: [
        {
          SchemeName: 'UK.OBIE.SortCodeAccountNumber',
          Identification: account.accountNumber,
          Name: `Account ${account.accountNumber.slice(-4)}`,
        },
      ],
    };
  }

  private mapAccountSubType(type: string): string {
    const map: Record<string, string> = {
      CHECKING: 'CurrentAccount',
      SAVINGS: 'Savings',
      MONEY_MARKET: 'MoneyMarketAccount',
      INVESTMENT: 'Investment',
    };
    return map[type] ?? 'CurrentAccount';
  }
}
