# SOC 2 Type II Controls Checklist

**Standard:** AICPA Trust Services Criteria (TSC) 2017  
**Platform:** TPT Banking — all microservices  
**Last reviewed:** 2026-06-13

---

## CC1 — Control Environment

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC1.1 | Board/management sets tone and CISO role defined | CTO owns security program; engineering lead owns compliance | Org chart |
| CC1.2 | Independence from operations for oversight | Compliance app is isolated microservice; compliance officers have separate Role enum entry | `packages/auth/src/types/jwt-payload.ts` |
| CC1.3 | Organizational structure with clear reporting | Role inheritance chain enforced in Casbin policy | `packages/auth/src/casbin/rbac-policy.csv` |
| CC1.4 | Competence requirements for key personnel | RBAC scoped by role: `compliance_officer`, `risk_manager`, `trader` | Role enforcement in NestJS guards |
| CC1.5 | Accountability through performance management | Audit log records all mutations with user UUID and timestamp | Kafka `audit.log` topic |

---

## CC2 — Communication and Information

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC2.1 | Information to meet commitments | API versioning (`/v1/`) with Swagger docs at `/api/docs` on all apps | `main.ts` in all apps |
| CC2.2 | Internal communication of objectives | CLAUDE.md documents all architectural invariants | `CLAUDE.md` |
| CC2.3 | External communication of commitments | Open Banking OBIE/PSD2/FDX APIs with consent management and TPP webhooks | `apps/open-banking/` |

---

## CC3 — Risk Assessment

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC3.1 | Risk identification process | DR runbooks document failure scenarios and recovery procedures | `docs/dr/` |
| CC3.2 | Risk analysis (likelihood × impact) | Pen test remediation report categorises findings by severity | `docs/security/pen-test-remediation.md` |
| CC3.3 | Risk mitigation for high-risk items | SSRF prevention, HSTS, clickjacking protection implemented | `proxy.service.ts`, all `main.ts` |
| CC3.4 | Risk assessment for vendor/partner changes | KYC provider toggle (`KYC_PROVIDER` env) with circuit breaker pattern | `packages/integrations/` |

---

## CC4 — Monitoring

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC4.1 | Ongoing evaluation of controls | OpenTelemetry traces + Prometheus metrics + structured logs | `packages/telemetry/` |
| CC4.2 | Evaluation and communication of deficiencies | `LoggingInterceptor` emits warn-level with trace ID on errors; Grafana dashboards alert on SLO breach | `packages/common/src/interceptors/logging.interceptor.ts` |

---

## CC5 — Control Activities

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC5.1 | Controls selected based on risk assessment | Defense-in-depth: auth → RBAC → step-up → idempotency → audit log | Multiple packages |
| CC5.2 | Controls implemented at transaction level | `IdempotencyInterceptor` + `TransferSaga` compensating transactions | `packages/common/`, `banking-core/modules/transactions/` |
| CC5.3 | Technology controls automated | Casbin policy enforcement, JWT guard, rate limiting — all automated with no manual bypass | `packages/auth/`, `apps/api-gateway/` |

---

## CC6 — Logical and Physical Access

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC6.1 | Access credentials managed | JWT RS256 4096-bit key pair; keys stored outside codebase in `keys/` (gitignored) | `.gitignore`, `packages/auth/` |
| CC6.2 | Authorized user access | RBAC: 12 roles, Casbin `p, r, e, m` model enforced on every request | `packages/auth/src/casbin/` |
| CC6.3 | Access removed promptly | Refresh token family invalidation on logout; Redis TTL expires sessions | `banking-core/modules/auth/auth.service.ts` |
| CC6.4 | Access restricted to authorized personnel | `super_admin` role required for admin operations; `step-up` required for high-risk transactions | `@Roles()`, `@RequireStepUp()` decorators |
| CC6.5 | Authentication credentials protected | Passwords hashed with argon2id; MFA via TOTP; refresh tokens stored as hash | `banking-core/modules/auth/` |
| CC6.6 | Network access restricted | Services only accessible via API gateway in production; Kubernetes NetworkPolicy (add to k8s manifests) | `apps/api-gateway/`, Ingress |
| CC6.7 | Transmission encryption | HTTPS enforced at Ingress (nginx TLS); HSTS header set in production; all inter-service traffic within cluster | `infra/k8s/ingress.yaml`, `main.ts` |
| CC6.8 | Unauthorized access prevented | Helmet security headers (CSP, HSTS, X-Frame-Options, COEP, CORP); CORS allowlist | `main.ts` in all apps |

---

## CC7 — System Operations

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC7.1 | Vulnerability detection procedures | `npm audit` + pen test remediation cycle | `docs/security/pen-test-remediation.md` |
| CC7.2 | Infrastructure monitoring | Prometheus scrapes all 11 apps; Grafana dashboards; Jaeger distributed tracing | `packages/telemetry/`, `infra/docker/prometheus/` |
| CC7.3 | Incident response | On-call rotation defined; DR runbooks document response procedures | `docs/dr/` |
| CC7.4 | Restoration of operations | PITR recovery from pgBackRest; Kafka recovery procedures documented | `docs/dr/postgres-recovery.md`, `docs/dr/full-platform-recovery.md` |
| CC7.5 | Disclosure of incidents | Incident channel procedure in DR overview; regulatory notification path defined | `docs/dr/README.md` |

---

## CC8 — Change Management

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC8.1 | Authorized changes only | Git branch protection; PRs required for main; Nx build verification | `nx.json`, GitHub settings |
| CC8.2 | Changes tested before deployment | k6 load tests (smoke, ACH 10k TPS, transfer saga); Jest unit + integration tests | `tests/load/`, `*.spec.ts` files |
| CC8.3 | Change documentation | CLAUDE.md architectural invariants; TODO.md build checklist; git commit history | `CLAUDE.md`, `TODO.md` |
| CC8.4 | Schema migrations controlled | `synchronize: false`; all migrations in `packages/database/src/migrations/` with explicit run | `packages/database/`, `CLAUDE.md` |

---

## CC9 — Risk Mitigation

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| CC9.1 | Vendor risk management | KYC circuit breaker; webhook signature validation for Stripe/Jumio/Onfido; provider fallback via env var | `packages/integrations/` |
| CC9.2 | Business continuity | RPO/RTO targets defined; DR runbooks tested quarterly | `docs/dr/README.md` |

---

## Availability (A1)

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| A1.1 | Capacity planning | HPA (minReplicas 2–3, maxReplicas 6–20) on all deployments; CPU/memory-based scaling | `infra/k8s/apps/*.yaml` |
| A1.2 | Environmental protection | Kubernetes rolling updates (`maxUnavailable: 0`); pod anti-affinity across nodes | All deployment YAMLs |
| A1.3 | Recovery / backup | Daily PostgreSQL PITR; 7-year Kafka audit log archival; 30-day backup retention | `docs/dr/backup-procedures.md` |

---

## Confidentiality (C1)

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| C1.1 | Identification of confidential information | PII fields enumerated in `PII_FIELDS` set; audit.log never deleted | `packages/common/src/interceptors/logging.interceptor.ts` |
| C1.2 | Disposal of confidential information | Log PII redacted (`[REDACTED]`); DB encryption at rest via Vault-managed keys (cross-cutting item) | `LoggingInterceptor`, cross-cutting backlog |

---

## Processing Integrity (PI1)

| Control ID | Control Description | Implementation | Evidence |
|-----------|---------------------|----------------|----------|
| PI1.1 | Complete and accurate processing | Double-entry ledger enforced by PostgreSQL trigger; saga compensates on failure | `packages/database/src/migrations/`, `TransferSaga` |
| PI1.2 | Transaction error detection | Saga status machine: PENDING → PROCESSING → COMPLETED / FAILED with compensation steps | `banking-core/modules/transactions/` |
| PI1.3 | Output completeness | Statement generation covers all ledger entries for the period; GIPS-compliant household reports | `banking-core/modules/statements/`, `wealth-management/` |

---

## Privacy (P1–P8 — abbreviated)

| Control ID | Control Description | Implementation |
|-----------|---------------------|----------------|
| P1 | Privacy notice communicated | Open Banking consent management; consent stored with timestamp | `apps/open-banking/modules/consent/` |
| P3 | Consent obtained | OAuth2/PKCE authorization server with explicit scope grant | `apps/open-banking/modules/oauth2/` |
| P4 | Consistent with consent | AISP/PISP scope enforcement — read-only vs. payment-initiating scopes | OBIE, PSD2, FDX scope checks |
| P6 | Third-party disclosure | KYC provider selection per environment; no PII in Kafka topics beyond audit.log | `KYC_PROVIDER` env var |
| P8 | Quality of personal information | Customer CIF with validation; KYC verification status tracked | `banking-core/modules/customers/` |

---

## Open Items (not yet implemented)

| Item | Priority | Target |
|------|----------|--------|
| PII column-level encryption (Vault Transit) | High | Cross-cutting backlog |
| Kubernetes NetworkPolicy to restrict inter-service traffic | High | Next sprint |
| Swagger UI gated behind `NODE_ENV !== 'production'` | Medium | Next sprint |
| Dependabot / `npm audit` in CI | Medium | Next sprint |
| CDD / EDD modules (Phase 3b) | Medium | Phase 3b |
| Immutable audit log verification job | Medium | Cross-cutting backlog |
| SOC 2 Type II audit engagement (external auditor) | High | 6 months post-production |
