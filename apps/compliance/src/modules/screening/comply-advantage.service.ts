import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { ProviderAdapter, CircuitBreaker } from '@tpt/integrations';

export interface ComplyAdvantageSearchParams {
  name: string;
  dateOfBirth?: string;
  nationality?: string;
  searchType: 'INDIVIDUAL' | 'COMPANY';
  filters?: {
    types?: string[];
    exactMatch?: boolean;
  };
}

export interface ComplyAdvantageMatch {
  id: string;
  matchScore: number;
  name: string;
  types: string[];
  sources: string[];
  fields: Record<string, unknown>;
  isWhitelisted: boolean;
}

export interface ComplyAdvantageSearchResult {
  searchId: string;
  totalHits: number;
  matches: ComplyAdvantageMatch[];
  riskScore: number;
  rawResponse?: Record<string, unknown>;
}

const HIGH_RISK_JURISDICTIONS = new Set([
  'IR', 'KP', 'SY', 'CU', 'SD', 'MM', 'LY', 'BY', 'RU', 'VE',
]);

@Injectable()
export class ComplyAdvantageService extends ProviderAdapter {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly circuitBreaker = new CircuitBreaker('comply-advantage');

  constructor(
    private readonly config: ConfigService,
    http: HttpService,
  ) {
    super(http);
    this.baseUrl = this.config.get<string>(
      'COMPLY_ADVANTAGE_BASE_URL',
      'https://api.complyadvantage.com',
    );
    this.apiKey = this.config.get<string>('COMPLY_ADVANTAGE_API_KEY', '');
  }

  name(): string { return 'comply-advantage'; }

  isConfigured(cfg: ConfigService): boolean {
    return !!cfg.get('COMPLY_ADVANTAGE_API_KEY');
  }

  async search(params: ComplyAdvantageSearchParams): Promise<ComplyAdvantageSearchResult> {
    if (!this.isConfigured(this.config)) {
      this.logger.warn('ComplyAdvantage API key not configured — returning mock clear result');
      return this.mockClearResult();
    }

    const payload = {
      search_term: params.name,
      client_ref:  `tpt-${Date.now()}`,
      fuzziness:   params.filters?.exactMatch ? 0 : 0.6,
      filters: {
        types: params.filters?.types ?? ['sanction', 'warning', 'fitness-probity', 'pep'],
      },
      ...(params.dateOfBirth ? { birth_year: params.dateOfBirth.substring(0, 4) } : {}),
      ...(params.nationality ? { country_codes: [params.nationality] } : {}),
    };

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.post<Record<string, unknown>>(
          `${this.baseUrl}/searches`,
          payload,
          { headers: { Authorization: `Token ${this.apiKey}`, 'Content-Type': 'application/json' } },
        ),
      ).then((r) => r.data),
    );

    return this.mapResponse(data);
  }

  async getSearch(searchId: string): Promise<ComplyAdvantageSearchResult> {
    if (!this.isConfigured(this.config)) {
      return this.mockClearResult();
    }

    const data = await this.circuitBreaker.execute(() =>
      firstValueFrom(
        this.http.get<Record<string, unknown>>(
          `${this.baseUrl}/searches/${searchId}`,
          { headers: { Authorization: `Token ${this.apiKey}` } },
        ),
      ).then((r) => r.data),
    );

    return this.mapResponse(data);
  }

  isHighRiskJurisdiction(countryCode: string): boolean {
    return HIGH_RISK_JURISDICTIONS.has(countryCode.toUpperCase());
  }

  private mapResponse(data: Record<string, unknown>): ComplyAdvantageSearchResult {
    const content    = (data['content'] as Record<string, unknown>) ?? {};
    const hits       = (content['hits'] as Record<string, unknown>[]) ?? [];
    const activeHits = hits.filter((h) => !(h['whitelisted'] as boolean));

    const matches: ComplyAdvantageMatch[] = activeHits.map((hit) => ({
      id:           hit['doc']
        ? (hit['doc'] as Record<string, unknown>)['id'] as string
        : String(hit['id']),
      matchScore:   (hit['score'] as number) ?? 0,
      name:         (hit['doc'] as Record<string, unknown>)?.['name'] as string ?? '',
      types:        ((hit['doc'] as Record<string, unknown>)?.['types'] as string[]) ?? [],
      sources:      ((hit['doc'] as Record<string, unknown>)?.['sources'] as string[]) ?? [],
      fields:       (hit['doc'] as Record<string, unknown>) ?? {},
      isWhitelisted: false,
    }));

    return {
      searchId:    String(content['search_id'] ?? data['id'] ?? `search_${Date.now()}`),
      totalHits:   activeHits.length,
      matches,
      riskScore:   activeHits.length > 0 ? Math.min(100, activeHits.length * 25) : 0,
      rawResponse: data,
    };
  }

  private mockClearResult(): ComplyAdvantageSearchResult {
    return { searchId: `mock_${Date.now()}`, totalHits: 0, matches: [], riskScore: 0 };
  }
}
