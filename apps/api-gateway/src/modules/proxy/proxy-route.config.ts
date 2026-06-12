export interface ProxyRoute {
  /** URL prefix to match on incoming requests (after the global /v1 prefix) */
  prefix: string;
  /** Environment variable name holding the upstream base URL */
  upstreamEnv: string;
  /** Display name for health checks */
  serviceName: string;
}

export const PROXY_ROUTES: ProxyRoute[] = [
  { prefix: '/banking',       upstreamEnv: 'BANKING_CORE_URL',       serviceName: 'banking-core' },
  { prefix: '/compliance',    upstreamEnv: 'COMPLIANCE_URL',          serviceName: 'compliance' },
  { prefix: '/open-banking',  upstreamEnv: 'OPEN_BANKING_URL',        serviceName: 'open-banking' },
  { prefix: '/investment',    upstreamEnv: 'INVESTMENT_BANKING_URL',  serviceName: 'investment-banking' },
  { prefix: '/pricing',       upstreamEnv: 'PRICING_ENGINE_URL',      serviceName: 'pricing-engine' },
  { prefix: '/risk',          upstreamEnv: 'RISK_ANALYTICS_URL',      serviceName: 'risk-analytics' },
  { prefix: '/regulatory',    upstreamEnv: 'REGULATORY_REPORTING_URL', serviceName: 'regulatory-reporting' },
  { prefix: '/treasury',      upstreamEnv: 'TREASURY_URL',            serviceName: 'treasury' },
  { prefix: '/wealth',        upstreamEnv: 'WEALTH_MGMT_URL',         serviceName: 'wealth-management' },
] as const;

/** Default upstream base URLs for local development */
export const DEFAULT_UPSTREAM_URLS: Record<string, string> = {
  BANKING_CORE_URL:          'http://localhost:3000',
  COMPLIANCE_URL:            'http://localhost:3002',
  OPEN_BANKING_URL:          'http://localhost:3003',
  INVESTMENT_BANKING_URL:    'http://localhost:3004',
  PRICING_ENGINE_URL:        'http://localhost:3005',
  RISK_ANALYTICS_URL:        'http://localhost:3006',
  REGULATORY_REPORTING_URL:  'http://localhost:3007',
  TREASURY_URL:              'http://localhost:3008',
  WEALTH_MGMT_URL:           'http://localhost:3009',
};
