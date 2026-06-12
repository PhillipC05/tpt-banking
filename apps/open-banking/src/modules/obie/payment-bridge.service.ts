import { Injectable, Logger, BadGatewayException } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import type { Redis } from 'ioredis';
import { firstValueFrom } from 'rxjs';
import { v4 as uuidv4 } from 'uuid';
import { Money } from '@tpt/shared';

const PAYMENT_MAP_TTL_SECONDS = 604_800; // 7 days — covers SEPA D+1 and wire settlement

export type ObPaymentStatus =
  | 'AcceptedSettlementInProcess'
  | 'AcceptedSettlementCompleted'
  | 'Rejected'
  | 'Pending';

export type Psd2PaymentStatus = 'RCVD' | 'ACSC' | 'ACSP' | 'RJCT';

@Injectable()
export class PaymentBridgeService {
  private readonly logger = new Logger(PaymentBridgeService.name);
  private readonly bankingCoreUrl: string;
  private readonly domesticRoute: string;
  private readonly serviceJwt: string;

  constructor(
    private readonly http: HttpService,
    private readonly cfg: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    this.bankingCoreUrl = cfg.get('BANKING_CORE_URL', 'http://localhost:3000');
    this.domesticRoute  = cfg.get('DOMESTIC_PAYMENT_ROUTE', 'rtp');
    this.serviceJwt     = cfg.get('INTERNAL_SERVICE_JWT', '');
  }

  private get authHeader(): Record<string, string> {
    return this.serviceJwt
      ? { Authorization: `Bearer ${this.serviceJwt}` }
      : {};
  }

  /** Submit an OBIE domestic payment to banking-core. Returns an obPaymentId. */
  async submitDomesticPayment(params: {
    consentId: string;
    initiation: {
      InstructedAmount: { Amount: string; Currency: string };
      CreditorAccount:  { Identification: string; Name?: string };
      CreditorName?:    string;
      RemittanceInformation?: { Reference?: string; Unstructured?: string };
    };
  }, idempotencyKey: string): Promise<{ obPaymentId: string; status: ObPaymentStatus }> {
    const { initiation } = params;

    // Always parse through Money — never pass raw float to banking-core
    const amount = new Money(
      initiation.InstructedAmount.Amount,
      initiation.InstructedAmount.Currency,
    );

    const obPaymentId = `OBIE-${uuidv4()}`;

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.bankingCoreUrl}/v1/payments/${this.domesticRoute}`,
          {
            amount:       amount.toDecimalString(),
            currency:     amount.currency,
            creditorAccountId: initiation.CreditorAccount.Identification,
            creditorName: initiation.CreditorName ?? initiation.CreditorAccount.Name ?? '',
            reference:    initiation.RemittanceInformation?.Reference ?? '',
            description:  initiation.RemittanceInformation?.Unstructured ?? '',
          },
          {
            headers: {
              ...this.authHeader,
              'Idempotency-Key': idempotencyKey,
              'Content-Type':    'application/json',
            },
            timeout: 15_000,
          },
        ),
      );

      const bankingCorePaymentId = (response.data as { id?: string }).id ?? obPaymentId;
      await this.redis.setex(
        `ob:payment:map:${obPaymentId}`,
        PAYMENT_MAP_TTL_SECONDS,
        bankingCorePaymentId,
      );

      this.logger.log(`OBIE payment ${obPaymentId} → banking-core ${bankingCorePaymentId}`);
      return { obPaymentId, status: 'AcceptedSettlementInProcess' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`OBIE payment submission failed: ${msg}`);
      throw new BadGatewayException(`Payment submission failed: ${msg}`);
    }
  }

  /** Submit a PSD2 SEPA credit transfer to banking-core. */
  async submitSepaPayment(params: {
    instructedAmount: { currency: string; amount: string };
    creditorName: string;
    creditorAccount: { iban: string };
    debtorAccount?: { iban: string };
    remittanceInformationUnstructured?: string;
  }, requestId: string): Promise<{ psd2PaymentId: string; status: Psd2PaymentStatus }> {
    const amount = new Money(params.instructedAmount.amount, params.instructedAmount.currency);
    const psd2PaymentId = `PSD2-${uuidv4()}`;

    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.bankingCoreUrl}/v1/payments/sepa`,
          {
            amount:        amount.toDecimalString(),
            currency:      amount.currency,
            creditorIban:  params.creditorAccount.iban,
            creditorName:  params.creditorName,
            debtorIban:    params.debtorAccount?.iban ?? '',
            reference:     params.remittanceInformationUnstructured ?? '',
          },
          {
            headers: {
              ...this.authHeader,
              'Idempotency-Key': requestId,
              'Content-Type':    'application/json',
            },
            timeout: 15_000,
          },
        ),
      );

      const bankingCorePaymentId = (response.data as { id?: string }).id ?? psd2PaymentId;
      await this.redis.setex(
        `ob:payment:map:${psd2PaymentId}`,
        PAYMENT_MAP_TTL_SECONDS,
        bankingCorePaymentId,
      );

      this.logger.log(`PSD2 SEPA payment ${psd2PaymentId} → banking-core ${bankingCorePaymentId}`);
      return { psd2PaymentId, status: 'RCVD' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`PSD2 SEPA payment submission failed: ${msg}`);
      throw new BadGatewayException(`SEPA payment submission failed: ${msg}`);
    }
  }

  /** Retrieve the current status of a payment by obPaymentId. */
  async getPaymentStatus(obPaymentId: string): Promise<ObPaymentStatus> {
    const bankingCorePaymentId = await this.redis.get(`ob:payment:map:${obPaymentId}`);
    if (!bankingCorePaymentId) {
      return 'AcceptedSettlementInProcess'; // unknown — default to in-process
    }

    try {
      const response = await firstValueFrom(
        this.http.get(
          `${this.bankingCoreUrl}/v1/payments/${bankingCorePaymentId}`,
          { headers: this.authHeader, timeout: 10_000 },
        ),
      );

      return this.mapBankingCoreStatus(
        (response.data as { status?: string }).status ?? '',
      );
    } catch {
      return 'AcceptedSettlementInProcess';
    }
  }

  /** Map banking-core internal status strings to OBIE status values. */
  private mapBankingCoreStatus(status: string): ObPaymentStatus {
    const upper = status.toUpperCase();
    if (upper === 'COMPLETED' || upper === 'SETTLED') return 'AcceptedSettlementCompleted';
    if (upper === 'FAILED' || upper === 'REJECTED')   return 'Rejected';
    return 'AcceptedSettlementInProcess';
  }
}
