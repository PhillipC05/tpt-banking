# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Infrastructure (must be running before any app)
npm run docker:up          # start PostgreSQL 16, Redis 7, Kafka, Vault
npm run docker:down        # stop all infra
npm run docker:logs        # tail infra logs

# Database
npm run migration:run      # apply all pending migrations
npm run migration:generate # generate new migration from entity changes
npm run migration:revert   # revert the last migration

# JWT keys (required first-time setup)
npm run keys:generate      # creates keys/private.pem and keys/public.pem

# Run a single app in dev mode
nx serve banking-core      # port 3000
nx serve api-gateway       # port 3001
nx serve compliance        # port 3002
nx serve open-banking      # port 3003
nx serve investment-banking # port 3004
nx serve pricing-engine    # port 3005
nx serve risk-analytics    # port 3006
nx serve regulatory-reporting # port 3007
nx serve treasury          # port 3008
nx serve wealth-management # port 3009

# Build
npm run build              # build all apps and packages
nx build <app-name>        # build one app

# Tests
npm run test               # run all tests
nx test <app-name>         # test one app
nx test <app-name> --testFile=path/to/file.spec.ts  # single test file
```

After `docker:up`, wait ~30s for services, then `migration:run` before starting any app.

Swagger UI for every app is at `http://localhost:<port>/api/docs`.

---

## Monorepo structure

Nx workspace with yarn workspaces. Two top-level directories:

**`packages/`** — shared libraries consumed by all apps via path aliases:

| Package | Alias | Purpose |
|---|---|---|
| `packages/shared` | `@tpt/shared` | `Money` value object, `InsufficientFundsError`, `CurrencyMismatchError` |
| `packages/database` | `@tpt/database` | TypeORM `AppDataSource`, all entities, all migrations |
| `packages/common` | `@tpt/common` | `GlobalValidationPipe`, `HttpExceptionFilter`, `LoggingInterceptor`, `IdempotencyInterceptor`, `@CurrentUser()` decorator |
| `packages/auth` | `@tpt/auth` | JWT RS256 strategies, `JwtAuthGuard`, `RolesGuard`, `StepUpAuthGuard`, `@Roles()` / `@RequireStepUp()` decorators, Casbin policy files |
| `packages/kafka` | `@tpt/kafka` | `KafkaTopics` constants, `KafkaModule`, base event type |

**`apps/`** — NestJS microservices. Each app is self-contained with its own `package.json`, `tsconfig.json`, `src/main.ts`, and `src/app.module.ts`. New modules go under `src/modules/<module-name>/`.

---

## Key architecture invariants

### 1. Money arithmetic
**Always** use the `Money` class from `@tpt/shared` for monetary values exposed through public APIs and domain logic. It wraps `decimal.js` and enforces currency matching. For internal service calculations where currency is implicit (single-currency), using `Decimal` from `decimal.js` directly is acceptable — but values stored in the DB or returned from controllers must use `money.toDecimalString()` / `Money.fromDecimalString()`. Never use JS `number` for money.

### 2. Account balance updates
Account `balance` and `availableBalance` are **read-only from application code**. They are maintained exclusively by the PostgreSQL trigger `update_account_balance_on_ledger_entry` (defined in migration `1700000000000-InitialSchema`). All balance changes must go through posting a ledger journal via `JournalService.postJournal()`. Never issue a direct `UPDATE` on `accounts.balance`.

### 3. Idempotency
All POST endpoints that mutate financial state **must** apply `IdempotencyInterceptor` from `@tpt/common`. The interceptor reads the `Idempotency-Key` header, caches successful responses in Redis for 24 hours, and replays them on duplicate requests. Clients that omit the header on a POST receive `422 Unprocessable Entity`.

### 4. Transfer saga
Internal transfers go through `TransferSaga` (six steps: validate → hold → journal → release hold → complete). Any failure triggers compensating actions (release hold, reverse journal, mark FAILED). Do not bypass the saga for balance movements.

### 5. Step-up authentication
High-risk operations (transfers > $10K, all wire transfers, admin operations, SAR filing) require an `X-Step-Up-Token` header. The token is obtained by `POST /auth/step-up` with the user's password, valid for 5 minutes, stored in Redis. Apply `@RequireStepUp('reason')` + `StepUpAuthGuard` to the route; the service then calls `AuthService.validateStepUpToken()`.

---

## Authentication & RBAC

JWT RS256 (4096-bit key pair in `keys/`). Access token contains `sub` (user UUID), `email`, `roles[]`, and `sessionId`. Refresh tokens have a `tokenFamily` for rotation.

Roles are defined in `packages/auth/src/types/jwt-payload.ts` (`Role` enum) and enforced by Casbin using the policy files in `packages/auth/src/casbin/`:
- `rbac-policy.conf` — Casbin model (role inheritance + `p, r, e, m` definitions)
- `rbac-policy.csv` — permission entries

Role inheritance chain: `retail_customer → preferred_customer → hnw_client → vip_client`; `teller → retail_customer`; `admin → relationship_manager`; `super_admin → admin + compliance_officer + trader`.

Apply `@Roles(Role.X)` on a controller/handler; `RolesGuard` is registered globally in every app's `main.ts`.

---

## Database

Single PostgreSQL 16 database (`tpt_banking`). All entities live in `packages/database/src/entities/` and are registered in `packages/database/src/entities/index.ts`. All migrations live in `packages/database/src/migrations/`.

`AppDataSource` from `@tpt/database` is the singleton used by both `TypeOrmModule.forRootAsync` (pass `{ ...AppDataSource.options, autoLoadEntities: true }`) and the TypeORM CLI. `synchronize` is always `false` — use migrations.

Each app's `app.module.ts` registers TypeORM the same way:
```typescript
TypeOrmModule.forRootAsync({
  useFactory: () => ({ ...AppDataSource.options, autoLoadEntities: true }),
})
```

---

## App bootstrap pattern

Every NestJS app's `main.ts` follows the same pattern:
1. `helmet()` + global prefix `v1`
2. `GlobalValidationPipe`, `HttpExceptionFilter`, `LoggingInterceptor`
3. `RolesGuard` registered globally
4. Swagger via `DocumentBuilder` at `GET /api/docs`
5. Port from env var (e.g. `WEALTH_PORT ?? '3009'`)

---

## In-memory vs. persisted state

Apps in phases 6–10 (pricing-engine, risk-analytics, regulatory-reporting, treasury, wealth-management) use **in-memory Maps** as their data store (no TypeORM repositories). This is intentional for the current build phase — these services are stateless across restarts. When adding persistence to these apps, introduce TypeORM entities in `@tpt/database`, create a migration, and replace the Map with injected repositories.

Apps in phases 1–5 (banking-core, compliance, open-banking, investment-banking) use TypeORM repositories backed by PostgreSQL.

---

## Kafka

All topic names are constants in `packages/kafka/src/topics.ts` (`KafkaTopics`). The `audit.log` topic is write-only and must never be deleted (7-year retention). Use `@tpt/kafka`'s `KafkaModule` to inject a producer; consumers are registered per-module.

---

## Port map

| Port | App |
|------|-----|
| 3000 | banking-core |
| 3001 | api-gateway |
| 3002 | compliance |
| 3003 | open-banking |
| 3004 | investment-banking |
| 3005 | pricing-engine |
| 3006 | risk-analytics |
| 3007 | regulatory-reporting |
| 3008 | treasury |
| 3009 | wealth-management |
| 5432 | PostgreSQL |
| 6379 | Redis |
| 9092 | Kafka (host) |
| 8080 | Kafka UI |
| 8200 | HashiCorp Vault (dev token: `dev-root-token`) |
