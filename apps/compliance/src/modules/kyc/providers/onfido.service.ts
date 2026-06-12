import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ProviderAdapter, CircuitBreaker } from '@tpt/integrations';

export interface OnfidoCheckResult {
  checkId: string;
  applicantId: string;
  status: string;
  result: string | null;
  subResult: string | null;
  reportsUrl: string;
  breakdowns?: Record<string, unknown>;
}

@Injectable()
export class OnfidoService extends ProviderAdapter {
  private readonly baseUrl = 'https://api.onfido.com/v3.6';
  private readonly apiToken: string;
  private readonly circuitBreaker = new CircuitBreaker('onfido');

  constructor(
    private readonly config: ConfigService,
    http: HttpService,
  ) {
    super(http);
    this.apiToken = this.config.get<string>('ONFIDO_API_TOKEN', '');
  }

  name(): string { return 'onfido'; }

  isConfigured(cfg: ConfigService): boolean {
    return !!cfg.get('ONFIDO_API_TOKEN');
  }

  private get headers() {
    return {
      Authorization:  `Token token=${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  async createApplicant(params: {
    firstName: string;
    lastName: string;
    email: string;
    dateOfBirth: string;
    nationality: string;
  }): Promise<{ applicantId: string }> {
    if (!this.isConfigured(this.config)) {
      return { applicantId: `onfido_mock_${Date.now()}` };
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.post<{ id: string }>(
          `${this.baseUrl}/applicants`,
          {
            first_name:  params.firstName,
            last_name:   params.lastName,
            email:       params.email,
            dob:         params.dateOfBirth,
            nationality: params.nationality,
          },
          { headers: this.headers },
        ),
      ).then((r) => r.data),
    );

    return { applicantId: data.id };
  }

  async generateSdkToken(applicantId: string, referrer: string): Promise<string> {
    if (!this.isConfigured(this.config)) {
      return `onfido_sdk_mock_${Date.now()}`;
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.post<{ token: string }>(
          `${this.baseUrl}/sdk_token`,
          { applicant_id: applicantId, referrer },
          { headers: this.headers },
        ),
      ).then((r) => r.data),
    );

    return data.token;
  }

  async createCheck(applicantId: string): Promise<OnfidoCheckResult> {
    if (!this.isConfigured(this.config)) {
      return {
        checkId:    `onfido_check_mock_${Date.now()}`,
        applicantId,
        status:     'in_progress',
        result:     null,
        subResult:  null,
        reportsUrl: '',
      };
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.post<{
          id: string;
          applicant_id: string;
          status: string;
          result: string | null;
          sub_result: string | null;
          results_uri: string;
        }>(
          `${this.baseUrl}/checks`,
          { applicant_id: applicantId, report_names: ['document', 'facial_similarity_photo'] },
          { headers: this.headers },
        ),
      ).then((r) => r.data),
    );

    return {
      checkId:    data.id,
      applicantId: data.applicant_id,
      status:     data.status,
      result:     data.result,
      subResult:  data.sub_result,
      reportsUrl: data.results_uri,
    };
  }

  async getCheckResult(checkId: string): Promise<OnfidoCheckResult> {
    if (!this.isConfigured(this.config)) {
      return { checkId, applicantId: '', status: 'complete', result: 'clear', subResult: 'clear', reportsUrl: '' };
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.get<{
          id: string;
          applicant_id: string;
          status: string;
          result: string | null;
          sub_result: string | null;
          results_uri: string;
        }>(
          `${this.baseUrl}/checks/${checkId}`,
          { headers: this.headers },
        ),
      ).then((r) => r.data),
    );

    return {
      checkId:    data.id,
      applicantId: data.applicant_id,
      status:     data.status,
      result:     data.result,
      subResult:  data.sub_result,
      reportsUrl: data.results_uri,
    };
  }

  mapResult(result: string | null): 'APPROVED' | 'DECLINED' | 'REVIEW_REQUIRED' {
    switch (result?.toLowerCase()) {
      case 'clear':    return 'APPROVED';
      case 'consider': return 'REVIEW_REQUIRED';
      default:         return 'DECLINED';
    }
  }
}
