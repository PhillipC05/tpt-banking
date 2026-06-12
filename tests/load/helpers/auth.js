import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

export function authenticate(email, password) {
  const res = http.post(
    `${BASE_URL}/v1/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' } },
  );

  check(res, { 'auth status 200': (r) => r.status === 200 });

  const body = res.json();
  return body.accessToken;
}

export function authHeaders(token, idempotencyKey) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
  if (idempotencyKey) {
    headers['Idempotency-Key'] = idempotencyKey;
  }
  return headers;
}
