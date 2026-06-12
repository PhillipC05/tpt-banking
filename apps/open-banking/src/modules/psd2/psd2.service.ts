import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { OpenBankingConsent, ConsentStatus, ConsentType, Account, LedgerEntry } from '@tpt/database';
import { Money } from '@tpt/shared';
import { PaymentBridgeService } from '../obie/payment-bridge.service';
import { WebhookDeliveryService } from '../webhooks/webhook-delivery.service';

/**
 * PSD2 / Berlin Group NextGenPSD2 resource server.
 * Formats responses per the Berlin Group XS2A specification v1.3.
 */
@Injectable()
export class Psd2Service {
  private readonly logger = new Logger(Psd2Service.name);

  constructor(
    @InjectRepository(OpenBankingConsent)
    private readonly consentRepo: Repository<OpenBankingConsent>,
    @InjectRepository(Account)
    private readonly accountRepo: Repository<Account>,
    @InjectRepository(LedgerEntry)
    private readonly ledgerRepo: Repository<LedgerEntry>,
    private readonly paymentBridge: PaymentBridgeService,
    private readonly webhookDelivery: WebhookDeliveryService,
  ) {}

  async createConsent(
    requestId: string,
    psuId: string,
    tppRedirectUri: string,
    body: {
      access: { accounts?: string[]; balances?: string[]; transactions?: string[] };
      recurringIndicator: boolean;
      validUntil: string;
      frequencyPerDay: number;
    },
  ): Promise<Record<string, unknown>> {
    const consent = this.consentRepo.create({
      type: ConsentType.ACCOUNT_ACCESS,
      status: ConsentStatus.AWAITING_AUTHORISATION,
      permissions: [
        ...(body.access.accounts ? ['ReadAccountsBasic'] : []),
        ...(body.access.balances ? ['ReadBalances'] : []),
        ...(body.access.transactions ? ['ReadTransactionsDetail'] : []),
      ],
      expiresAt: new Date(body.validUntil),
      clientId: 'pending',
      riskData: { requestId, psuId, tppRedirectUri },
    });
    const saved = await this.consentRepo.save(consent);

    const baseUrl = process.env['OPEN_BANKING_PORTAL_URL'] ?? 'http://localhost:3003';
    const scaRedirectLink = `${baseUrl}/auth/consent?consent_id=${saved.consentId}&standard=PSD2`;

    return {
      consentId: saved.consentId,
      consentStatus: 'received',
      _links: {
        scaRedirect: { href: scaRedirectLink },
        self: { href: `/berlingroup/v1.3/consents/${saved.consentId}` },
        status: { href: `/berlingroup/v1.3/consents/${saved.consentId}/status` },
        scaStatus: { href: `/berlingroup/v1.3/consents/${saved.consentId}/authorisations` },
      },
    };
  }

  async getConsent(consentId: string): Promise<Record<string, unknown>> {
    const consent = await this.findConsent(consentId);

    return {
      access: { accounts: 'allAccounts', balances: 'allAccounts', transactions: 'allAccounts' },
      recurringIndicator: true,
      validUntil: consent.expiresAt?.toISOString().split('T')[0],
      frequencyPerDay: 4,
      lastActionDate: consent.updatedAt.toISOString().split('T')[0],
      consentStatus: this.mapStatusPsd2(consent.status),
    };
  }

  async getConsentStatusOnly(consentId: string): Promise<Record<string, unknown>> {
    const consent = await this.findConsent(consentId);
    return { consentStatus: this.mapStatusPsd2(consent.status) };
  }

  async getAccounts(consentId: string, authorization: string): Promise<Record<string, unknown>> {
    const consent = await this.findActiveConsent(consentId);

    const accounts = consent.authorisedAccountIds?.length > 0
      ? await this.accountRepo.find({ where: { id: In(consent.authorisedAccountIds) } })
      : await this.accountRepo.find({ where: { customerId: consent.customerId! } });

    return {
      accounts: accounts.map((a) => ({
        resourceId: a.id,
        iban: `GB${a.accountNumber.padStart(22, '0')}`,
        currency: a.currency,
        name: `Account ${a.accountNumber.slice(-4)}`,
        product: a.type,
        status: a.status === 'ACTIVE' ? 'enabled' : 'blocked',
        _links: {
          account: { href: `/berlingroup/v1.3/accounts/${a.id}` },
          balances: { href: `/berlingroup/v1.3/accounts/${a.id}/balances` },
          transactions: { href: `/berlingroup/v1.3/accounts/${a.id}/transactions` },
        },
      })),
    };
  }

  async getBalances(consentId: string, accountId: string): Promise<Record<string, unknown>> {
    const consent = await this.findActiveConsent(consentId);
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    if (account.customerId !== consent.customerId) throw new UnauthorizedException('Account not accessible under this consent');

    return {
      account: { iban: `GB${account.accountNumber.padStart(22, '0')}` },
      balances: [
        {
          balanceAmount: { currency: account.currency, amount: account.balance },
          balanceType: 'closingBooked',
          lastChangeDateTime: new Date().toISOString(),
        },
        {
          balanceAmount: { currency: account.currency, amount: account.availableBalance },
          balanceType: 'interimAvailable',
          lastChangeDateTime: new Date().toISOString(),
        },
      ],
    };
  }

  async getTransactions(
    consentId: string,
    accountId: string,
    dateFrom?: string,
    dateTo?: string,
  ): Promise<Record<string, unknown>> {
    const consent = await this.findActiveConsent(consentId);
    const account = await this.accountRepo.findOne({ where: { id: accountId } });
    if (!account) throw new NotFoundException(`Account ${accountId} not found`);
    if (account.customerId !== consent.customerId) throw new UnauthorizedException('Account not accessible under this consent');

    const qb = this.ledgerRepo
      .createQueryBuilder('entry')
      .where('entry.accountId = :accountId', { accountId })
      .orderBy('entry.createdAt', 'DESC')
      .limit(200);

    if (dateFrom) qb.andWhere('entry.createdAt >= :from', { from: new Date(dateFrom) });
    if (dateTo) qb.andWhere('entry.createdAt <= :to', { to: new Date(dateTo) });

    const entries = await qb.getMany();

    return {
      account: { iban: `GB${accountId.replace(/-/g, '').slice(0, 22).padStart(22, '0')}` },
      transactions: {
        booked: entries.map((e) => ({
          transactionId: e.id,
          bookingDate: e.createdAt.toISOString().split('T')[0],
          valueDate: e.createdAt.toISOString().split('T')[0],
          transactionAmount: {
            currency: e.currency,
            amount: e.type === 'DEBIT' ? `-${e.amount}` : e.amount,
          },
          creditorName: e.description ?? '',
          remittanceInformationUnstructured: e.description ?? '',
          balanceAfterTransaction: {
            balanceAmount: { currency: e.currency, amount: e.balanceAfter },
            balanceType: 'interimBooked',
          },
        })),
        pending: [],
      },
    };
  }

  async initiatePayment(
    requestId: string,
    paymentProduct: string,
    body: {
      instructedAmount: { currency: string; amount: string };
      debtorAccount: { iban: string };
      creditorName: string;
      creditorAccount: { iban: string };
      remittanceInformationUnstructured?: string;
    },
  ): Promise<Record<string, unknown>> {
    const { psd2PaymentId, status } = await this.paymentBridge.submitSepaPayment(body, requestId);

    void this.webhookDelivery.queueDelivery('payment.pending', {
      paymentId: psd2PaymentId,
      status,
    });

    return {
      transactionStatus: status,
      paymentId: psd2PaymentId,
      _links: {
        scaRedirect: {
          href: `${process.env['OPEN_BANKING_PORTAL_URL'] ?? 'http://localhost:3003'}/auth/payment?payment_id=${psd2PaymentId}`,
        },
        self:   { href: `/berlingroup/v1.3/payments/${paymentProduct}/${psd2PaymentId}` },
        status: { href: `/berlingroup/v1.3/payments/${paymentProduct}/${psd2PaymentId}/status` },
      },
    };
  }

  async getPaymentStatus(paymentId: string): Promise<Record<string, unknown>> {
    const obStatus = await this.paymentBridge.getPaymentStatus(paymentId);
    const statusMap: Record<string, string> = {
      AcceptedSettlementCompleted: 'ACSC',
      AcceptedSettlementInProcess: 'ACSP',
      Rejected:                    'RJCT',
      Pending:                     'RCVD',
    };
    return { paymentId, transactionStatus: statusMap[obStatus] ?? 'ACSP' };
  }

  async getPaymentStatusOnly(paymentId: string): Promise<Record<string, unknown>> {
    const { transactionStatus } = await this.getPaymentStatus(paymentId) as { transactionStatus: string };
    return { transactionStatus };
  }

  async confirmFunds(
    consentId: string,
    body: {
      account: { iban: string };
      instructedAmount: { currency: string; amount: string };
    },
  ): Promise<Record<string, unknown>> {
    const consent = await this.findActiveConsent(consentId);

    const requested = new Money(body.instructedAmount.amount, body.instructedAmount.currency);

    // Reverse synthetic IBAN to accountNumber: strip 'GB' prefix + leading zeros
    const bban = body.account.iban.replace(/^GB0*/, '');
    const account = await this.accountRepo.findOne({ where: { accountNumber: bban } });
    if (!account) throw new BadRequestException(`Account with IBAN ${body.account.iban} not found`);
    if (account.customerId !== consent.customerId) throw new BadRequestException('IBAN does not match consent holder');

    const available = Money.fromDecimalString(account.availableBalance, account.currency);
    const fundsAvailable = available.amount.gte(requested.amount);

    return { fundsAvailable };
  }

  private async findConsent(consentId: string): Promise<OpenBankingConsent> {
    const consent = await this.consentRepo.findOne({ where: { consentId } });
    if (!consent) throw new NotFoundException(`Consent ${consentId} not found`);
    return consent;
  }

  private async findActiveConsent(consentId: string): Promise<OpenBankingConsent> {
    const consent = await this.findConsent(consentId);
    if (consent.status !== ConsentStatus.AUTHORISED) {
      throw new NotFoundException(`Consent ${consentId} is not authorised`);
    }
    if (consent.expiresAt && consent.expiresAt < new Date()) {
      await this.consentRepo.update(consent.id, { status: ConsentStatus.EXPIRED });
      throw new NotFoundException(`Consent ${consentId} has expired`);
    }
    return consent;
  }

  private mapStatusPsd2(status: ConsentStatus): string {
    const map: Record<ConsentStatus, string> = {
      [ConsentStatus.AWAITING_AUTHORISATION]: 'received',
      [ConsentStatus.AUTHORISED]: 'valid',
      [ConsentStatus.REJECTED]: 'rejected',
      [ConsentStatus.REVOKED]: 'revokedByPsu',
      [ConsentStatus.EXPIRED]: 'expired',
    };
    return map[status] ?? 'received';
  }
}
