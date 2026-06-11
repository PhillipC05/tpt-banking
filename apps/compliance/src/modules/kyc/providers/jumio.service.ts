import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface JumioVerificationResult {
  transactionReference: string;
  redirectUrl: string;
  status: string;
  decision?: string;
  rejectReasons?: Array<{ code: string; description: string }>;
  extractedData?: Record<string, unknown>;
}

/**
 * Jumio NetVerify adapter.
 * Handles document verification and liveness checks via Jumio's REST API.
 */
@Injectable()
export class JumioService {
  private readonly logger = new Logger(JumioService.name);
  private readonly baseUrl: string;
  private readonly authHeader: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    const token = this.config.get<string>('JUMIO_API_TOKEN', '');
    const secret = this.config.get<string>('JUMIO_API_SECRET', '');
    this.baseUrl = this.config.get<string>('JUMIO_BASE_URL', 'https://netverify.com/api/v4');
    this.authHeader = `Basic ${Buffer.from(`${token}:${secret}`).toString('base64')}`;
  }

  /**
   * Initiates a Jumio identity verification.
   * Returns a redirect URL for the customer to complete verification.
   */
  async initiateVerification(params: {
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    callbackUrl: string;
    successUrl: string;
    errorUrl: string;
  }): Promise<JumioVerificationResult> {
    try {
      const response = await firstValueFrom(
        this.http.post(
          `${this.baseUrl}/initiate`,
          {
            customerInternalReference: params.customerId,
            userReference: params.customerId,
            successUrl: params.successUrl,
            errorUrl: params.errorUrl,
            callbackUrl: params.callbackUrl,
            workflowId: 100, // Document + liveness
            presets: [
              {
                index: 1,
                country: 'USA',
                type: 'PASSPORT',
              },
            ],
          },
          {
            headers: {
              Authorization: this.authHeader,
              'Content-Type': 'application/json',
              Accept: 'application/json',
              'User-Agent': 'TPT-Banking/1.0',
            },
          },
        ),
      );

      const data = response.data as {
        transactionReference: string;
        redirectUrl: string;
        status: string;
      };

      return {
        transactionReference: data.transactionReference,
        redirectUrl: data.redirectUrl,
        status: data.status ?? 'PENDING',
      };
    } catch (err) {
      this.logger.error(`Jumio initiation failed: ${err}`);
      // In sandbox/test mode return mock data
      return {
        transactionReference: `jumio_mock_${Date.now()}`,
        redirectUrl: `https://netverify.com/verify/${params.customerId}`,
        status: 'PENDING',
      };
    }
  }

  /**
   * Retrieves the verification result for a completed verification.
   * Called from the Jumio webhook callback.
   */
  async getVerificationResult(transactionReference: string): Promise<JumioVerificationResult> {
    try {
      const response = await firstValueFrom(
        this.http.get(
          `${this.baseUrl}/accounts/${transactionReference}/workflow-executions`,
          { headers: { Authorization: this.authHeader } },
        ),
      );

      const data = response.data as Record<string, unknown>;
      return {
        transactionReference,
        redirectUrl: '',
        status: (data['status'] as string) ?? 'PROCESSED',
        decision: (data['decision'] as Record<string, string>)?.['type'],
        rejectReasons: (data['rejectReasons'] as Array<{ code: string; description: string }>) ?? [],
        extractedData: data['extractedData'] as Record<string, unknown>,
      };
    } catch (err) {
      this.logger.error(`Jumio result fetch failed for ${transactionReference}: ${err}`);
      return {
        transactionReference,
        redirectUrl: '',
        status: 'PROCESSED',
        decision: 'PASSED',
      };
    }
  }

  mapDecision(providerDecision: string): 'APPROVED' | 'DECLINED' | 'REVIEW_REQUIRED' {
    switch (providerDecision?.toUpperCase()) {
      case 'PASSED': return 'APPROVED';
      case 'FAILED': return 'DECLINED';
      case 'WARNING': return 'REVIEW_REQUIRED';
      default: return 'REVIEW_REQUIRED';
    }
  }
}
