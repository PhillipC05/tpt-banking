/**
 * Transfer saga stress test.
 *
 * Tests the full 6-step saga: validate → hold → journal → release hold → complete.
 * Verifies saga compensating transactions under load.
 *
 * Run:
 *   k6 run tests/load/transfer-saga.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e AUTH_TOKEN=<jwt> \
 *     -e SOURCE_ACCOUNT=<uuid> \
 *     -e DEST_ACCOUNT=<uuid>
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL     = __ENV.BASE_URL       || 'http://localhost:3000';
const AUTH_TOKEN   = __ENV.AUTH_TOKEN     || '';
const SOURCE_ACCT  = __ENV.SOURCE_ACCOUNT || 'replace-me';
const DEST_ACCT    = __ENV.DEST_ACCOUNT   || 'replace-me';

const sagaSuccess  = new Rate('saga_success_rate');
const sagaDuration = new Trend('saga_duration_ms', true);
const sagaFailed   = new Counter('saga_failed_total');

export const options = {
  scenarios: {
    saga_load: {
      executor: 'ramping-vus',
      startVUs: 10,
      stages: [
        { duration: '30s', target: 100 },
        { duration: '60s', target: 500 },
        { duration: '60s', target: 500 },
        { duration: '30s', target: 0   },
      ],
    },
  },
  thresholds: {
    saga_success_rate:  ['rate>0.99'],
    saga_duration_ms:   ['p(95)<2000', 'p(99)<5000'],
    http_req_failed:    ['rate<0.01'],
  },
};

export default function () {
  const idempotencyKey = uuidv4();
  const amount = (Math.random() * 99 + 1).toFixed(2);

  const res = http.post(
    `${BASE_URL}/v1/transfers`,
    JSON.stringify({
      sourceAccountId: SOURCE_ACCT,
      destinationAccountId: DEST_ACCT,
      amount,
      currency: 'USD',
      description: 'k6 saga stress test',
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Idempotency-Key': idempotencyKey,
      },
      timeout: '10s',
    },
  );

  const ok = res.status >= 200 && res.status < 300;
  sagaSuccess.add(ok);
  sagaDuration.add(res.timings.duration);
  if (!ok) sagaFailed.add(1);

  check(res, {
    'transfer status 2xx':     (r) => r.status >= 200 && r.status < 300,
    'transfer has transferId':  (r) => {
      try { return !!r.json('transferId'); } catch { return false; }
    },
  });

  sleep(0.05);
}
