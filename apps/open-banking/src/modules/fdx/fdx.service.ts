import { Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OpenBankingConsent, ConsentStatus, ConsentType, Account, LedgerEntry } from '@tpt/database';
import { v4 as uuidv4 } from 'uuid';
import { OAuth2Service } from '../oauth2/oauth2.service';
import { PaymentBridgeService } from '../obie/payment-bridge.service';

// FDX data cluster codes
const FDX_DATA_CLUSTERS = {
  ACCOUNT_BASIC: 'ACCOUNT_BASIC',
  ACCOUNT_DETAILED: 'ACCOUNT_DETAILED',
  TRANSACTIONS: 'TRANSACTIONS',
  ACCOUNT_PAYMENT_NETWORK_INFORMATION: 'ACCOUNT_PAYMENT_NETWORK_INFORMATION',
  CUSTOMER: 'CUSTOMER',
  CUSTOMER_CONTACT: 'CUSTOMER_CONTACT',
  PAYMENT_SUPPORT: 'PAYMENT_SUPPORT',
};

/**
 * FDX v6.0 resource server.
 * Uses FDX data model and response formats.
 */
@Injectable()
export class FdxService {
  private readonly logger = new Logger(FdxService.name);

  constructor(
    @InjectRepository(OpenBankingConsent)
    private readonly consentRepo: Repository<OpenBankingConsent>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    private readonly oauth2Service: OAuth2Service,
    private readonly paymentBridge: PaymentBridgeService,
  ) {}

  private async resolveTokenToConsent(authorization: string): Promise<OpenBankingConsent> {
    const token = authorization?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing Bearer token');
    const introspection = await this.oauth2Service.introspectToken(token, '*');
    if (!introspection.active || !introspection.consent_id) throw new UnauthorizedException('Invalid or expired token');
    const consent = await this.consentRepo.findOne({ where: { consentId: introspection.consent_id } });
    if (!consent || consent.status !== ConsentStatus.AUTHORISED) throw new UnauthorizedException('Consent not active');
    return consent;
  }

  async createConsent(
    authorization: string,
    body: {
      dataClusters: string[];
      lookbackPeriod?: number;
      expirationDate?: string;
      resources?: Array<{ resourceType: string; resourceIds: string[] }>;
    },
  ): Promise<Record<string, unknown>> {
    const consent = this.consentRepo.create({
      type: ConsentType.ACCOUNT_ACCESS,
      status: ConsentStatus.AWAITING_AUTHORISATION,
      permissions: body.dataClusters,
      expiresAt: body.expirationDate ? new Date(body.expirationDate) : null,
      clientId: 'pending',
      riskData: { lookbackPeriod: body.lookbackPeriod, resources: body.resources },
    });
    const saved = await this.consentRepo.save(consent);

    return {
      consentId: saved.consentId,
      status: 'PENDING',
      dataClusters: body.dataClusters,
      lookbackPeriod: body.lookbackPeriod,
      expirationDate: body.expirationDate,
      createdTime: saved.createdAt.toISOString(),
      links: {
        self: { href: `/fdx/v6/consents/${saved.consentId}` },
        authorize: {
          href: `${process.env['OPEN_BANKING_PORTAL_URL'] ?? 'http://localhost:3003'}/auth/consent?consent_id=${saved.consentId}&standard=FDX`,
        },
      },
    };
  }

  async getConsent(consentId: string): Promise<Record<string, unknown>> {
    const consent = await this.findConsent(consentId);

    const statusMap: Record<ConsentStatus, string> = {
      [ConsentStatus.AWAITING_AUTHORISATION]: 'PENDING',
      [ConsentStatus.AUTHORISED]: 'ACTIVE',
      [ConsentStatus.REJECTED]: 'REJECTED',
      [ConsentStatus.REVOKED]: 'REVOKED',
      [ConsentStatus.EXPIRED]: 'EXPIRED',
    };

    return {
      consentId: consent.consentId,
      status: statusMap[consent.status] ?? 'PENDING',
      dataClusters: consent.permissions,
      expirationDate: consent.expiresAt?.toISOString().split('T')[0],
      createdTime: consent.createdAt.toISOString(),
      updatedTime: consent.updatedAt.toISOString(),
    };
  }

  async revokeConsent(consentId: string, reason: string): Promise<Record<string, unknown>> {
    const consent = await this.findConsent(consentId);
    await this.consentRepo.update(consent.id, {
      status: ConsentStatus.REVOKED,
      revokedAt: new Date(),
    });
    return { consentId, status: 'REVOKED', revokedTime: new Date().toISOString() };
  }

  async getAccounts(authorization: string): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authorization);
    const accountIds = consent.authorisedAccountIds ?? [];
    const accounts = accountIds.length > 0
      ? await this.accountRepo.find({ where: { id: In(accountIds) } })
      : await this.accountRepo.find({ where: { customerId: consent.customerId! } });

    return {
      accounts: accounts.map((a) => ({
        accountId: a.id,
        status: a.status === 'ACTIVE' ? 'OPEN' : a.status,
        accountType: a.type,
        displayName: `${a.type} ...${a.accountNumber.slice(-4)}`,
        currency: { currencyCode: a.currency },
        currentBalance: parseFloat(a.balance),
        availableBalance: parseFloat(a.availableBalance),
        accountNumber: a.accountNumber,
        interestRates: a.interestRate ? [{ type: 'APR', rate: parseFloat(a.interestRate) }] : [],
      })),
      page: { nextOffset: null },
    };
  }

  async getAccount(authorization: string, accountId: string): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authorization);
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    if (account.customerId !== consent.customerId) throw new UnauthorizedException('Account not accessible under this consent');

    return {
      accountId: account.id,
      status: account.status === 'ACTIVE' ? 'OPEN' : account.status,
      accountType: account.type,
      displayName: `${account.type} ...${account.accountNumber.slice(-4)}`,
      currency: { currencyCode: account.currency },
      currentBalance: parseFloat(account.balance),
      availableBalance: parseFloat(account.availableBalance),
      openedDate: account.openedAt?.toISOString().split('T')[0],
      accountNumber: account.accountNumber,
      routingNumbers: [{ type: 'ABA', number: '021000021' }], // Mock ABA
    };
  }

  async getTransactions(
    authorization: string,
    accountId: string,
    startDate?: string,
    endDate?: string,
    offset = 0,
    limit = 50,
  ): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authorization);
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    if (account.customerId !== consent.customerId) throw new UnauthorizedException('Account not accessible under this consent');

    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.accountId = :accountId', { accountId })
      .orderBy('entry.createdAt', 'DESC')
      .offset(offset)
      .limit(Math.min(limit, 200));

    if (startDate) qb.andWhere('entry.createdAt >= :start', { start: new Date(startDate) });
    if (endDate) qb.andWhere('entry.createdAt <= :end', { end: new Date(endDate) });

    const [entries, total] = await qb.getManyAndCount();

    return {
      transactions: entries.map((e) => ({
        transactionId: e.id,
        transactionType: e.type === 'CREDIT' ? 'CREDIT' : 'DEBIT',
        status: 'POSTED',
        amount: parseFloat(e.type === 'DEBIT' ? `-${e.amount}` : e.amount),
        currency: { currencyCode: e.currency },
        postedTimestamp: e.createdAt.toISOString(),
        description: e.description ?? 'Transaction',
        runningBalance: parseFloat(e.balanceAfter),
      })),
      page: {
        total,
        nextOffset: offset + limit < total ? offset + limit : null,
        prevOffset: offset > 0 ? Math.max(0, offset - limit) : null,
      },
    };
  }

  async initiatePayment(
    authorization: string,
    body: {
      paymentType: string;
      amount: { currencyCode: string; value: string };
      debtorAccount: { accountId: string };
      creditorAccount: { accountNumber: string; routingNumber: string };
      memo?: string;
    },
  ): Promise<Record<string, unknown>> {
    const consent = await this.resolveTokenToConsent(authorization);
    const idempotencyKey = `FDX-${uuidv4()}`;

    const { obPaymentId, status } = await this.paymentBridge.submitDomesticPayment(
      {
        consentId: consent.consentId,
        initiation: {
          InstructedAmount: { Amount: body.amount.value, Currency: body.amount.currencyCode },
          CreditorAccount: { Identification: body.creditorAccount.accountNumber },
          RemittanceInformation: { Unstructured: body.memo ?? '' },
        },
      },
      idempotencyKey,
    );

    const fdxStatus = status === 'AcceptedSettlementInProcess' ? 'PROCESSING'
      : status === 'AcceptedSettlementCompleted' ? 'PROCESSED' : 'PENDING';

    return {
      paymentId: obPaymentId,
      status: fdxStatus,
      paymentType: body.paymentType,
      amount: body.amount,
      createdTime: new Date().toISOString(),
    };
  }

  private async findConsent(consentId: string): Promise<OpenBankingConsent> {
    const consent = await this.consentRepo.findOne({ where: { consentId } });
    if (!consent) throw new NotFoundException(`Consent ${consentId} not found`);
    return consent;
  }
}
