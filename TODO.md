# TPT Banking Platform — Build Checklist

## Phase 1: Foundation (Weeks 1–4)
### Monorepo & Infrastructure
- [x] Root `package.json` (Nx workspace)
- [x] `nx.json`
- [x] `tsconfig.base.json`
- [x] `.env.example`
- [x] `.gitignore`
- [x] `infra/docker/docker-compose.yml` (dev stack)
- [x] `infra/docker/docker-compose.prod.yml` (production)
- [x] `infra/docker/nginx/nginx.conf`
- [x] `deploy/vps-setup.sh`
- [x] `deploy/wsl-setup.sh`

### Shared Package (`packages/shared`)
- [x] `Money` value object (decimal.js wrapper)
- [x] Currency constants + validator
- [x] Base error classes (BankingError, InsufficientFundsError, etc.)

### Database Package (`packages/database`)
- [x] TypeORM DataSource config
- [x] `Customer` entity
- [x] `Account` entity
- [x] `Journal` entity (double-entry)
- [x] `LedgerEntry` entity
- [x] Initial migration (tables + balance trigger)

### Common Package (`packages/common`)
- [x] `IdempotencyInterceptor`
- [x] `HttpExceptionFilter`
- [x] `LoggingInterceptor` (PII-stripped)
- [x] `ValidationPipe`
- [x] `@CurrentUser()` decorator

### Auth Package (`packages/auth`)
- [x] JWT RS256 strategy
- [x] Refresh token strategy
- [x] `JwtAuthGuard`, `RolesGuard`, `StepUpAuthGuard`
- [x] `@Roles()`, `@RequireStepUp()` decorators
- [x] Casbin RBAC policy (9 roles)

### Kafka Package (`packages/kafka`)
- [x] Kafka module (dynamic)
- [x] Topic constants
- [x] Base event interface

### API Gateway App (`apps/api-gateway`)
- [x] Bootstrap + Swagger at `/api/docs`
- [x] `ThrottlerModule` (Redis, 100 req/15min)
- [x] `/health` endpoint
- [x] Proxy module

### Banking Core App (`apps/banking-core`) — Phase 1 modules
- [x] Bootstrap + global pipes/filters/interceptors
- [x] Auth module (login, logout, refresh, register, MFA setup/verify, step-up)
- [x] Users module
- [x] Customers module (CIF, onboarding, tier management)
- [x] Accounts module (CRUD, balance, holds)
- [x] Ledger module (double-entry journal posting, reversal)
- [x] Transactions module + Transfer Saga (debit → credit → journal → event → compensate)

---

## Phase 2: Core Banking (Weeks 5–8)
- [x] Loan origination module (`loans/loans.service.ts` — application, DTOs)
- [x] Loan underwriting module (rules-based decision in `loans.service.ts`)
- [x] Loan amortization + servicing (amortization engine, payment schedule, disbursement)
- [ ] Collections module (delinquency tracking, workout plans — Phase 2b)
- [x] ACH payments via Plaid SDK (`payments/ach/`, `payments/plaid/plaid.service.ts`)
- [x] Wire/SWIFT payments (`payments/wire/wire.service.ts` — domestic Fedwire + international SWIFT)
- [x] Debit card module (Stripe Issuing — `cards/cards.service.ts`, `stripe-issuing.service.ts`)
- [x] Credit card module (Stripe Issuing — same service, CardType.CREDIT)
- [x] Card authorization module (processAuthorization, clearTransaction in cards.service.ts)
- [ ] Dispute management (Phase 2b — Stripe dispute webhook handling)
- [x] Statement generation (`statements/statements.service.ts` — monthly statements)
- [x] Notifications module (`notifications/notifications.service.ts` — email stub + Twilio SMS)

---

## Phase 3: KYC / AML / Compliance (Weeks 9–12)
- [x] KYC workflow — Jumio adapter (`kyc/providers/jumio.service.ts`) + Onfido adapter (`onfido.service.ts`) — provider toggled by `KYC_PROVIDER` env var
- [ ] CDD (Customer Due Diligence) module — extend KYC with risk rating (Phase 3b)
- [ ] EDD (Enhanced Due Diligence) module — enhanced questionnaire for HNW/VIP (Phase 3b)
- [x] OFAC / Sanctions screening — ComplyAdvantage SDK (`screening/comply-advantage.service.ts`)
- [x] PEP screening — same ComplyAdvantage service, different filter set
- [x] AML transaction monitoring rules engine — 7 rules: CTR threshold, structuring, velocity, large wire, high-risk jurisdiction, round dollar (`aml/rules/aml-rules.engine.ts`)
- [x] Alert management module — assign, close, escalate, SLA due dates (`aml/aml.service.ts + controller`)
- [x] Case management module — create, add notes (append-only), status flow, link SAR (`cases/`)
- [x] SAR filing — dual-control (two compliance officers), 30-day deadline, FinCEN stub (`sar/`)
- [x] CTR filing — auto-triggers on cash > $10K, 15-day deadline, FinCEN stub (`ctr/`)
- [ ] Admin + compliance portal (Next.js) — Phase 3c (APIs-first mode)

---

## Phase 4: Real-Time Payments & Open Banking (Weeks 13–16)
- [x] RTP (TCH Real-Time Payments) — `payments/rtp/rtp.service.ts`, $1M limit, ISO 20022, 24/7
- [x] FedNow — same service, `RtpRail.FED_NOW`, $500K default limit
- [x] SEPA — `payments/sepa/sepa.service.ts` — SCT (next-day), SCT Inst (10-sec, €100K limit), SDD Core; IBAN validation
- [x] UK Open Banking OBIE v3.1 — AISP (accounts, balances, transactions) + PISP (domestic payments) — `apps/open-banking/src/modules/obie/`
- [x] PSD2 / Berlin Group NextGenPSD2 v1.3 — AIS + PIS, PSU-ID header, SEPA CT, SCA redirect — `apps/open-banking/src/modules/psd2/`
- [x] FDX v6 (US Financial Data Exchange) — consent, accounts, transactions, payments extension — `apps/open-banking/src/modules/fdx/`
- [x] OAuth2 + PKCE authorization server — RFC 6749+7636+7662+7009, S256 only, opaque tokens in Redis, refresh token rotation — `apps/open-banking/src/modules/oauth2/`
- [x] Open Banking consent management — ConsentService, client registry (register/activate/suspend), TPP management — `apps/open-banking/src/modules/consent/` + `clients/`

---

## Phase 5: Investment Banking Core (Weeks 17–22)
- [x] Instrument master data — ISIN/CUSIP/SEDOL/ticker/Bloomberg/RIC, all asset classes, derivatives metadata in JSONB (`instruments/`)
- [x] OMS — FIX protocol fields (ClOrdID, OrdType, Side, TIF, OrdStatus, OrderCapacity), pre-trade compliance (lot size, short-sell locate, notional limit) (`orders/`)
- [x] EMS — fill recording (lastQty/lastPx/commission), T+N settlement date calculation, avgPx update (`executions/`)
- [x] Positions module — signed long/short, weighted avg cost, realized/unrealized P&L, mark-to-market, firm-wide exposure aggregation (`positions/`)
- [x] Portfolio module — IPS bounds enforcement, portfolio recalculation, risk profile, benchmark (`portfolios/`)
- [x] Trading desk dashboards — equity/fixed income/derivatives P&L + exposure per desk, firm-wide exposure, risk limit pre-check (`trading-desk/`)
- [x] Trade lifecycle — PRE_TRADE → ORDER_ENTRY → EXECUTION → POST_TRADE → SETTLEMENT → CLOSED; settlement ladder; failed settlement monitoring (`trade-lifecycle/`)
- [ ] Trade blotter UI (Next.js) — APIs-first mode, Next.js portal in future phase

---

## Phase 6: Pricing Engine (Weeks 23–27)
- [x] Market data module — Redis quote cache, 20+ equity symbols, simulated dev feed, real update endpoint (`market-data/`)
- [x] Real-time pricing WebSocket gateway — Socket.IO `/pricing` namespace, symbol + FX pair subscriptions, configurable push interval, ping/pong heartbeat (`gateway/`)
- [x] Black-Scholes-Merton — European call/put, full Greeks (Δ,Γ,ν,Θ,ρ,Vanna,Volga), implied vol Newton-Raphson, options chain (`options/black-scholes.service.ts`)
- [x] Monte Carlo — European + Asian (arithmetic average) + barrier (up-and-out/down-and-out), antithetic variates, 95% confidence interval (`options/monte-carlo.service.ts`)
- [x] Binomial tree (CRR) — European and American options, backward induction, early exercise premium (`options/binomial-tree.service.ts`)
- [x] Yield curve — bootstrap from par swap rates, flat curve, log-linear DF interpolation, forward rates, par rates (`yield-curve/`)
- [x] IRS pricing — multi-curve framework (OIS discounting + forward curve), NPV, DV01, PV01, fair swap rate, full cash flow schedules (`rates/irs-pricing.service.ts`)
- [x] CDS pricing — ISDA model, constant hazard rate, NPV, par spread, credit DV01, upfront/running conversion (`credit/cds-pricing.service.ts`)
- [x] FX pricing — Garman-Kohlhagen option pricing, CIP forwards, forward curve (1W–2Y), FX swaps, 15 major pairs with embedded rates (`fx/fx-pricing.service.ts`)

---

## Phase 7: Risk Analytics (Weeks 28–32)
- [x] Historical VaR — empirical P&L distribution, square-root-of-time scaling (`risk-analytics/modules/var/`)
- [x] Parametric VaR — normal distribution, z-score scaling (`risk-analytics/modules/var/`)
- [x] Monte Carlo VaR — GBM with Cholesky-decomposed correlation, component VaR, diversification benefit (`risk-analytics/modules/var/`)
- [x] CVaR (Expected Shortfall) — all three VaR methods also compute CVaR (`risk-analytics/modules/var/`)
- [x] Stress testing (custom + CCAR regulatory scenarios) — Fed CCAR 2024 Severely Adverse/Adverse/Baseline, custom scenario batch (`risk-analytics/modules/stress-testing/`)
- [x] Greeks (Delta, Gamma, Vega, Theta, Rho) — portfolio aggregation, dollar Greeks, DV01, delta-hedge notional (`risk-analytics/modules/greeks/`)
- [x] Credit risk scoring — Altman Z-Score (3 variants), Merton structural model, Basel III EL/UL/RWA, retail FICO scorecard (`risk-analytics/modules/credit-risk/`)
- [x] CVA (Credit Valuation Adjustment) — analytical CVA, bilateral CVA+DVA+FVA, Monte Carlo CVA for IRS (`risk-analytics/modules/cva/`)
- [x] LCR (Liquidity Coverage Ratio) — HQLA haircuts, run-off rates, inflow cap, Level 2 caps (`risk-analytics/modules/liquidity/`)
- [x] NSFR (Net Stable Funding Ratio) — ASF/RSF factors, maturity-adjusted RSF, Basel III compliant (`risk-analytics/modules/liquidity/`)

---

## Phase 8: Regulatory Reporting (Weeks 33–36)
- [x] Basel III / IV capital adequacy reporting
- [x] CCAR / DFAST stress test reporting
- [x] FINRA reporting
- [x] SEC reporting
- [x] FinCEN reporting
- [x] Regulatory report scheduler

---

## Phase 9: Treasury (Weeks 37–40)
- [x] FX dealing desk (spot + forwards)
- [x] Liquidity forecasting
- [x] Cash pooling (physical + notional)
- [x] Interest rate risk management
- [x] Nostro / vostro account management
- [x] Correspondent banking module

---

## Phase 10: Wealth Management + VIP/HNW/Family Office (Weeks 41–46)
- [x] Private banking module
- [x] HNW / UHNW client tier management
- [x] VIP concierge + RM assignment
- [x] Family office: multi-entity consolidation
- [x] Family office: entity relationship graph
- [x] Family office: beneficiary management
- [x] Family office: IPS enforcement
- [x] Family office: document vault (encrypted)
- [x] Family office: GIPS-compliant household reporting
- [x] Robo-advisor (automated rebalancing)
- [x] Tax-loss harvesting
- [x] Trust & estate services

---

## Phase 11: Collateral & Prime Brokerage (Weeks 45–48)
- [x] Collateral management
- [x] Margin call management
- [x] Securities lending
- [x] Prime brokerage module

---

## Phase 12: Production Hardening (Weeks 49–52)
- [ ] OpenTelemetry observability (traces, metrics, logs)
- [ ] Kubernetes manifests
- [ ] k6 load tests (target: 10k TPS ACH batch)
- [ ] DR runbooks
- [ ] Pen test remediation
- [ ] SOC 2 controls checklist

---

## Cross-Cutting (ongoing)
- [ ] Immutable audit log (Kafka `audit.log` topic, 7-year retention)
- [ ] PII encryption at column level (Vault-managed keys)
- [ ] API versioning strategy (`/v1/`, `/v2/`)
- [ ] Rate limiting tuning per endpoint tier
- [ ] Swagger / OpenAPI spec auto-generation for all apps
- [ ] Jest unit tests — all domain logic
- [ ] Integration tests — all DB operations (real PostgreSQL, no mocks)
- [ ] CI/CD pipeline (GitHub Actions)
