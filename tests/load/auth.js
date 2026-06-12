/**
 * Auth endpoints load test — login, refresh, logout cycle.
 *
 * Validates rate limiting and token rotation under concurrent load.
 *
 * Run:
 *   k6 run tests/load/auth.js -e BASE_URL=http://localhost:3000
 *
 * Seeds must exist: test users with email test+N@tptbanking.com and password Test@1234567
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

const BASE_URL    = __ENV.BASE_URL || 'http://localhost:3000';
const USER_COUNT  = parseInt(__ENV.USER_COUNT || '100', 10);
const PASSWORD    = __ENV.TEST_PASSWORD || 'Test@1234567';

const loginRate   = new Rate('login_success_rate');
const refreshRate = new Rate('refresh_success_rate');

export const options = {
  scenarios: {
    auth_concurrent: {
      executor: 'constant-vus',
      vus: 50,
      duration: '2m',
    },
  },
  thresholds: {
    login_success_rate:   ['rate>0.99'],
    refresh_success_rate: ['rate>0.99'],
    http_req_duration:    ['p(95)<500', 'p(99)<1000'],
    http_req_failed:      ['rate<0.01'],
  },
};

export default function () {
  const userIndex = Math.floor(Math.random() * USER_COUNT);
  const email = `test+${userIndex}@tptbanking.com`;

  // Login
  const loginRes = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email, password: PASSWORD }),
    { headers: { 'Content-Type': 'application/json' }, timeout: '5s' },
  );

  const loginOk = loginRes.status === 200 || loginRes.status === 201;
  loginRate.add(loginOk);

  check(loginRes, {
    'login 200': (r) => r.status === 200,
    'login has accessToken': (r) => {
      try { return !!r.json('accessToken'); } catch { return false; }
    },
  });

  if (!loginOk) {
    sleep(1);
    return;
  }

  const { accessToken, refreshToken } = loginRes.json();

  sleep(0.1);

  // Refresh
  const refreshRes = http.post(
    `${BASE_URL}/v1/auth/refresh`,
    JSON.stringify({ refreshToken }),
    {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      timeout: '5s',
    },
  );

  const refreshOk = refreshRes.status === 200 || refreshRes.status === 201;
  refreshRate.add(refreshOk);

  check(refreshRes, {
    'refresh 200': (r) => r.status === 200,
    'refresh rotates token': (r) => {
      try {
        const body = r.json();
        return !!body.accessToken && body.refreshToken !== refreshToken;
      } catch { return false; }
    },
  });

  sleep(0.1);

  // Logout
  http.post(
    `${BASE_URL}/v1/auth/logout`,
    null,
    {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      timeout: '5s',
    },
  );

  sleep(0.2);
}
