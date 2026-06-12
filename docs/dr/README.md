# Disaster Recovery — Overview

## RTO / RPO Targets

| Tier | Service | RTO | RPO |
|------|---------|-----|-----|
| 1 | Banking Core, API Gateway | 15 min | 0 (synchronous replication) |
| 1 | PostgreSQL primary | 15 min | 5 min (WAL streaming) |
| 2 | Compliance, Open Banking | 30 min | 15 min |
| 2 | Kafka | 30 min | 0 (replication factor 3) |
| 3 | Investment Banking, Treasury, Wealth | 60 min | 30 min |
| 3 | Pricing Engine, Risk Analytics | 60 min | 60 min (in-memory, recomputable) |

## Runbook Index

| Runbook | Scenario |
|---------|----------|
| [postgres-recovery.md](postgres-recovery.md) | PostgreSQL primary failure, PITR, corruption |
| [redis-recovery.md](redis-recovery.md) | Redis node failure, data loss |
| [kafka-recovery.md](kafka-recovery.md) | Kafka broker failure, topic recovery, audit.log |
| [full-platform-recovery.md](full-platform-recovery.md) | Complete data centre / cluster loss |
| [backup-procedures.md](backup-procedures.md) | Scheduled backups, verification, retention |

## Incident Response Hierarchy

```
On-call engineer
  └── Engineering lead (if unresolved > 15 min)
        └── CTO (if Tier 1, > 30 min)
              └── Regulatory notification (if financial data at risk)
```

## DR Test Schedule

| Exercise | Frequency | Owner |
|----------|-----------|-------|
| PostgreSQL PITR restore to staging | Monthly | DBA |
| Kafka broker failover simulation | Quarterly | Platform |
| Full platform restore from backup | Semi-annual | All teams |
| Tabletop exercise | Annual | Engineering + Legal |
