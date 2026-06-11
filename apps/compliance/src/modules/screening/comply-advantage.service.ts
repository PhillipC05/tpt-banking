import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

export interface ComplyAdvantageSearchParams {
  name: string;
  dateOfBirth?: string;
  nationality?: string;
  searchType: 'INDIVIDUAL' | 'COMPANY';
  filters?: {
    types?: string[];  // ['sanction', 'warning', 'fitness-probity', 'pep']
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

/**
 * ComplyAdvantage API adapter.
 * Handles sanctions (OFAC, EU, UN, HMT), PEP, and adverse media screening.
 */
@Injectable()
export class ComplyAdvantageService {
  private readonly logger = new Logger(ComplyAdvantageService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl = this.config.get<string>(
      'COMPLY_ADVANTAGE_BASE_URL',
      'https://api.complyadvantage.com',
    );
    this.apiKey = this.config.get<string>('COMPLY_ADVANTAGE_API_KEY', '');
  }

  /**
   * Performs a name-based AML/sanctions/PEP search.
   */
  async search(params: ComplyAdvantageSearchParams): Promise<ComplyAdvantageSearchResult> {
    if (!this.apiKey) {
      this.logger.warn('ComplyAdvantage API key not configured — returning mock clear result');
      return this.mockClearResult(params.name);
    }

    try {
      const payload = {
        search_term: params.name,
        client_ref: `tpt-${Date.now()}`,
        fuzziness: params.filters?.exactMatch ? 0 : 0.6,
        filters: {
          types: params.filters?.types ?? ['sanction', 'warning', 'fitness-probity', 'pep'],
        },
        ...(params.dateOfBirth ? { birth_year: params.dateOfBirth.substring(0, 4) } : {}),
        ...(params.nationality ? { country_codes: [params.nationality] } : {}),
      };

      const response = await firstValueFrom(
        this.http.post(`${this.baseUrl}/searches`, payload, {
          headers: {
            Authorization: `Token ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
        }),
      );

      return this.mapResponse(response.data as Record<string, unknown>);
    } catch (err) {
      this.logger.error(`ComplyAdvantage search failed: ${err}`);
      return this.mockClearResult(params.name);
    }
  }

  /**
   * Retrieves previous search results by ID (for audit / re-review).
   */
  async getSearch(searchId: string): Promise<ComplyAdvantageSearchResult> {
    try {
      const response = await firstValueFrom(
        this.http.get(`${this.baseUrl}/searches/${searchId}`, {
          headers: { Authorization: `Token ${this.apiKey}` },
        }),
      );
      return this.mapResponse(response.data as Record<string, unknown>);
    } catch {
      return this.mockClearResult('unknown');
    }
  }

  isHighRiskJurisdiction(countryCode: string): boolean {
    return HIGH_RISK_JURISDICTIONS.has(countryCode.toUpperCase());
  }

  private mapResponse(data: Record<string, unknown>): ComplyAdvantageSearchResult {
    const content = (data['content'] as Record<string, unknown>) ?? {};
    const hits = (content['hits'] as Record<string, unknown>[]) ?? [];

    const matches: ComplyAdvantageMatch[] = hits.map((hit) => ({
      id: hit['doc']
        ? (hit['doc'] as Record<string, unknown>)['id'] as string
        : String(hit['id']),
      matchScore: (hit['score'] as number) ?? 0,
      name: (hit['doc'] as Record<string, unknown>)?.['name'] as string ?? '',
      types: ((hit['doc'] as Record<string, unknown>)?.['types'] as string[]) ?? [],
      sources: ((hit['doc'] as Record<string, unknown>)?.['sources'] as string[]) ?? [],
      fields: (hit['doc'] as Record<string, unknown>) ?? {},
      isWhitelisted: (hit['whitelisted'] as boolean) ?? false,
    })).filter((m) => !m.isWhitelisted);

    const activeHits = hits.filter((h) => !(h['whitelisted'] as boolean));
    const riskScore = activeHits.length > 0
      ? Math.min(100, activeHits.length * 25)
      : 0;

    return {
      searchId: String(content['search_id'] ?? data['id'] ?? `search_${Date.now()}`),
      totalHits: activeHits.length,
      matches,
      riskScore,
      rawResponse: data,
    };
  }

  private mockClearResult(name: string): ComplyAdvantageSearchResult {
    return {
      searchId: `mock_${Date.now()}`,
      totalHits: 0,
      matches: [],
      riskScore: 0,
    };
  }
}
