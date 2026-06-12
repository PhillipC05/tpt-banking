import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ProviderAdapter, CircuitBreaker } from '@tpt/integrations';

export interface JumioVerificationResult {
  transactionReference: string;
  redirectUrl: string;
  status: string;
  decision?: string;
  rejectReasons?: Array<{ code: string; description: string }>;
  extractedData?: Record<string, unknown>;
}

@Injectable()
export class JumioService extends ProviderAdapter {
  private readonly baseUrl: string;
  private readonly authHeader: string;
  private readonly circuitBreaker = new CircuitBreaker('jumio');

  constructor(
    private readonly config: ConfigService,
    http: HttpService,
  ) {
    super(http);
    const token  = this.config.get<string>('JUMIO_API_TOKEN', '');
    const secret = this.config.get<string>('JUMIO_API_SECRET', '');
    this.baseUrl    = this.config.get<string>('JUMIO_BASE_URL', 'https://netverify.com/api/v4');
    this.authHeader = `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`;
  }

  name(): string { return 'jumio'; }

  isConfigured(cfg: ConfigService): boolean {
    return !!cfg.get('JUMIO_API_TOKEN') && !!cfg.get('JUMIO_API_SECRET');
  }

  async initiateVerification(params: {
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    callbackUrl: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<JumioVerificationResult> {
    if (!this.isConfigured(this.config)) {
      return {
        transactionReference: `jumio_mock_${Date.now()}`,
        redirectUrl:          `https://netverify.com/verify/${params.customerId}`,
        status:               'PENDING',
      };
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.post<{ transactionReference: string; redirectUrl: string; status: string }>(
          `${this.baseUrl}/initiate`,
          {
            customerInternalReference: params.customerId,
            userReference: params.customerId,
            successUrl: params.successUrl,
            errorUrl:   params.errorUrl,
            callbackUrl: params.callbackUrl,
            workflowId: 100,
            presets: [{ index: 1, country: 'USA', type: 'PASSPORT' }],
          },
          {
            headers: {
              Authorization: this.authHeader,
              'Content-Type': 'application/json',
              Accept:         'application/json',
              'User-Agent':   'TPT-Banking/1.0',
            },
          },
        ),
      ).then((r) => r.data),
    );

    return {
      transactionReference: data.transactionReference,
      redirectUrl:          data.redirectUrl,
      status:               data.status ?? 'PENDING',
    };
  }

  async getVerificationResult(transactionReference: string): Promise<JumioVerificationResult> {
    if (!this.isConfigured(this.config)) {
      return { transactionReference, redirectUrl: '', status: 'PROCESSED', decision: 'PASSED' };
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.get<Record<string, unknown>>(
          `${this.baseUrl}/accounts/${transactionReference}/workflow-executions`,
          { headers: { Authorization: this.authHeader } },
        ),
      ).then((r) => r.data),
    );

    return {
      transactionReference,
      redirectUrl:    '',
      status:         (data['status'] as string) ?? 'PROCESSED',
      decision:       (data['decision'] as Record<string, string>)?.['type'],
      rejectReasons:  (data['rejectReasons'] as Array<{ code: string; description: string }>) ?? [],
      extractedData:  data['extractedData'] as Record<string, unknown>,
    };
  }

  mapDecision(providerDecision: string): 'APPROVED' | 'DECLINED' | 'REVIEW_REQUIRED' {
    switch (providerDecision?.toUpperCase()) {
      case 'PASSED':  return 'APPROVED';
      case 'FAILED':  return 'DECLINED';
      case 'WARNING': return 'REVIEW_REQUIRED';
      default:        return 'REVIEW_REQUIRED';
    }
  }
}
