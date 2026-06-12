# TPT Banking Platform

A production-grade open-source banking platform built as an Nx monorepo of NestJS microservices. Covers core banking, compliance, open banking, investment banking, pricing, risk analytics, regulatory reporting, treasury, and wealth management.

## Architecture

```
apps/
  api-gateway          (port 3001) — unified entry point, JWT auth, rate limiting
  banking-core         (port 3000) — accounts, ledger, transfers, payments
  compliance           (port 3002) — KYC/AML, SAR filing, transaction monitoring
  open-banking         (port 3003) — PSD2/Open Banking APIs, consent management
  investment-banking   (port 3004) — trade execution, settlement, portfolio mgmt
  pricing-engine       (port 3005) — loan/FX/fee pricing, rate sheets
  risk-analytics       (port 3006) — credit risk, market risk, VaR calculations
  regulatory-reporting (port 3007) — Basel III/IV, DFAST, automated report filing
  treasury             (port 3008) — liquidity management, ALM, funding desk
  wealth-management    (port 3009) — advisory, discretionary mandates, personal office

packages/
  shared      (@tpt/shared)      — Money value object, domain errors
  database    (@tpt/database)    — TypeORM entities, migrations, AppDataSource
  common      (@tpt/common)      — validation pipe, exception filter, interceptors
  auth        (@tpt/auth)        — JWT RS256 strategies, RBAC (Casbin), step-up auth
  kafka       (@tpt/kafka)       — Kafka module, topic constants
```

## Key Design Decisions

- **Money arithmetic** — `Money` class wraps `decimal.js`; never JS `number` for monetary values
- **Balance integrity** — account balances updated exclusively by a PostgreSQL trigger; no direct `UPDATE accounts SET balance`
- **Idempotency** — all mutating POST endpoints require an `Idempotency-Key` header (24-hour replay cache in Redis)
- **Transfer saga** — six-step saga (validate → hold → journal → release hold → complete) with compensating actions
- **Step-up auth** — high-risk ops (transfers > $10K, wires, admin, SAR) require a short-lived step-up token

## Prerequisites

- Docker & Docker Compose
- Node.js 20+
- Yarn

## Quick Start

```bash
# 1. Install dependencies
yarn install

# 2. Generate JWT key pair (first time only)
npm run keys:generate

# 3. Copy and edit environment variables
cp .env.example .env

# 4. Start infrastructure (PostgreSQL, Redis, Kafka, Vault)
npm run docker:up
# wait ~30 seconds for services to initialise

# 5. Run database migrations
npm run migration:run

# 6. Start a service
nx serve banking-core     # http://localhost:3000
nx serve api-gateway      # http://localhost:3001
```

Swagger UI is available at `http://localhost:<port>/api/docs` for every service.

## Infrastructure Ports

| Service     | Port |
|-------------|------|
| api-gateway | 3001 |
| banking-core | 3000 |
| compliance  | 3002 |
| open-banking | 3003 |
| investment-banking | 3004 |
| pricing-engine | 3005 |
| risk-analytics | 3006 |
| regulatory-reporting | 3007 |
| treasury    | 3008 |
| wealth-management | 3009 |
| PostgreSQL  | 5432 |
| Redis       | 6379 |
| Kafka       | 9092 |
| Kafka UI    | 8080 |
| HashiCorp Vault | 8200 |

## Authentication & RBAC

JWT RS256 (4096-bit). Role hierarchy: `retail_customer → preferred_customer → hnw_client → vip_client`; `teller → retail_customer`; `admin → relationship_manager`; `super_admin → admin + compliance_officer + trader`.

Step-up tokens are obtained via `POST /auth/step-up` and are valid for 5 minutes.

## Common Commands

```bash
npm run docker:up          # start infrastructure
npm run docker:down        # stop infrastructure
npm run migration:run      # apply pending migrations
npm run migration:generate # generate migration from entity changes
npm run migration:revert   # revert last migration
npm run build              # build all apps and packages
npm run test               # run all tests
nx build <app>             # build one app
nx test <app>              # test one app
```

## Documentation

- [Disaster Recovery](docs/dr/)
- [Security / Pen-test Remediation](docs/security/pen-test-remediation.md)
- [SOC 2 Controls](docs/compliance/soc2-controls.md)
- [Deployment](deploy/README.md)

## License

[MIT](LICENSE)
