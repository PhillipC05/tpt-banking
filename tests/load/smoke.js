/**
 * Smoke test — one VU, one iteration per endpoint.
 * Run with: k6 run tests/load/smoke.js
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const BASE_URLS = {
  bankingCore:    __ENV.BANKING_CORE_URL    || 'http://localhost:3000',
  apiGateway:     __ENV.API_GATEWAY_URL     || 'http://localhost:3001',
  compliance:     __ENV.COMPLIANCE_URL      || 'http://localhost:3002',
  openBanking:    __ENV.OPEN_BANKING_URL    || 'http://localhost:3003',
  pricingEngine:  __ENV.PRICING_ENGINE_URL  || 'http://localhost:3005',
  riskAnalytics:  __ENV.RISK_ANALYTICS_URL  || 'http://localhost:3006',
};

export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(99)<2000'],
  },
};

export default function () {
  const checks = [
    { url: `${BASE_URLS.bankingCore}/v1/health`,   label: 'banking-core health' },
    { url: `${BASE_URLS.apiGateway}/v1/health`,    label: 'api-gateway health' },
    { url: `${BASE_URLS.compliance}/v1/health`,    label: 'compliance health' },
    { url: `${BASE_URLS.openBanking}/v1/health`,   label: 'open-banking health' },
    { url: `${BASE_URLS.pricingEngine}/v1/health`, label: 'pricing-engine health' },
    { url: `${BASE_URLS.riskAnalytics}/v1/health`, label: 'risk-analytics health' },
  ];

  for (const { url, label } of checks) {
    const res = http.get(url);
    check(res, {
      [`${label} status 200`]: (r) => r.status === 200,
      [`${label} latency < 500ms`]: (r) => r.timings.duration < 500,
    });
    sleep(0.1);
  }
}
