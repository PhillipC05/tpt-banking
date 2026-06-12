/**
 * ACH Batch load test — target: 10,000 TPS sustained.
 *
 * This test hits the ACH initiation endpoint at extreme throughput.
 * Prerequisites:
 *   - A test account pair seeded in the DB (set ACCOUNT_ID, COUNTERPARTY_ACCOUNT_NUMBER)
 *   - A valid JWT for a teller/admin (set AUTH_TOKEN or ADMIN_EMAIL/ADMIN_PASSWORD)
 *
 * Run:
 *   k6 run tests/load/ach-batch.js \
 *     -e BASE_URL=http://localhost:3000 \
 *     -e AUTH_TOKEN=<jwt> \
 *     -e ACCOUNT_ID=<uuid> \
 *     -e COUNTERPARTY_ROUTING=021000021 \
 *     -e COUNTERPARTY_ACCOUNT=1234567890
 */
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

const BASE_URL       = __ENV.BASE_URL                || 'http://localhost:3000';
const AUTH_TOKEN     = __ENV.AUTH_TOKEN              || '';
const ACCOUNT_ID     = __ENV.ACCOUNT_ID             || 'replace-with-seeded-account-uuid';
const ROUTING        = __ENV.COUNTERPARTY_ROUTING    || '021000021';
const COUNTERPARTY   = __ENV.COUNTERPARTY_ACCOUNT    || '9876543210';

// Custom metrics
const achSuccess = new Counter('ach_success_total');
const achFailed  = new Counter('ach_failed_total');
const achRate    = new Rate('ach_success_rate');
const achDuration = new Trend('ach_request_duration_ms', true);

export const options = {
  // Ramp to 10k RPS, hold 60s, ramp down
  scenarios: {
    ach_sustained: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 500,
      maxVUs: 2000,
      stages: [
        { duration: '30s', target: 2000  },  // ramp to 2k TPS
        { duration: '30s', target: 5000  },  // ramp to 5k TPS
        { duration: '30s', target: 10000 },  // ramp to 10k TPS
        { duration: '60s', target: 10000 },  // hold 60s at 10k TPS
        { duration: '30s', target: 0     },  // ramp down
      ],
    },
  },
  thresholds: {
    ach_success_rate:            ['rate>0.995'],         // 99.5% success rate
    ach_request_duration_ms:     ['p(95)<500', 'p(99)<1000'],
    http_req_duration:           ['p(95)<500'],
    http_req_failed:             ['rate<0.005'],
  },
};

export default function () {
  const idempotencyKey = uuidv4();
  const payload = JSON.stringify({
    accountId: ACCOUNT_ID,
    amount: '1.00',
    currency: 'USD',
    counterpartyRoutingNumber: ROUTING,
    counterpartyAccountNumber: COUNTERPARTY,
    counterpartyName: 'k6 Load Test Recipient',
    description: 'k6 ACH batch load test',
    entryClassCode: 'PPD',
  });

  const res = http.post(
    `${BASE_URL}/v1/payments/ach`,
    payload,
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${AUTH_TOKEN}`,
        'Idempotency-Key': idempotencyKey,
      },
      timeout: '5s',
    },
  );

  const ok = res.status === 201 || res.status === 200;
  achDuration.add(res.timings.duration);
  achRate.add(ok);

  if (ok) {
    achSuccess.add(1);
  } else {
    achFailed.add(1);
  }

  check(res, {
    'ACH status 2xx':      (r) => r.status >= 200 && r.status < 300,
    'ACH has paymentId':   (r) => {
      try { return !!r.json('paymentId'); } catch { return false; }
    },
    'ACH latency < 500ms': (r) => r.timings.duration < 500,
  });
}
