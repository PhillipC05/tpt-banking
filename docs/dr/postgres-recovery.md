# PostgreSQL Disaster Recovery Runbook

## Scenarios

### 1. Primary node failure (replica promotion)

**Symptoms:** Banking Core returns 503; `pg_isready` fails on primary pod.

**Steps:**

```bash
# 1. Confirm primary is down
kubectl exec -n tpt-banking postgres-0 -- pg_isready -U tpt_banking || echo "PRIMARY DOWN"

# 2. Check replication lag on replica before promoting
kubectl exec -n tpt-banking postgres-1 -- psql -U tpt_banking -c \
  "SELECT now() - pg_last_xact_replay_timestamp() AS replication_lag;"

# 3. Promote replica to primary (pg_promote() — PostgreSQL 12+)
kubectl exec -n tpt-banking postgres-1 -- psql -U tpt_banking -c "SELECT pg_promote();"

# 4. Update the postgres Service selector to point to the new primary
kubectl patch svc postgres -n tpt-banking -p '{"spec":{"selector":{"statefulset.kubernetes.io/pod-name":"postgres-1"}}}'

# 5. Verify application connectivity
kubectl rollout restart deployment/banking-core -n tpt-banking
kubectl rollout status deployment/banking-core -n tpt-banking

# 6. Alert: RTO clock starts here. Target: primary back in service within 15 min.
```

**Post-recovery:**
- Rebuild failed pod as new replica
- Re-enable WAL streaming replication from new primary
- Confirm `pg_stat_replication` shows replica reconnected

---

### 2. Point-in-Time Recovery (PITR)

Used when data corruption or accidental deletion is detected.

**Pre-requisites:** WAL-G or pgBackRest configured with S3/GCS bucket (see [backup-procedures.md](backup-procedures.md)).

```bash
# 1. Stop all write traffic (put api-gateway into maintenance mode)
kubectl scale deployment api-gateway --replicas=0 -n tpt-banking

# 2. Identify the target recovery time
# Check audit.log Kafka topic for the last known-good transaction timestamp
# Example: 2026-06-10T14:32:00Z

# 3. Restore from base backup + WAL replay to target time
# Using pgBackRest (adjust stanza name and target time):
kubectl exec -n tpt-banking postgres-0 -- \
  pgbackrest --stanza=tpt-banking --delta \
  --target="2026-06-10 14:32:00" \
  --target-action=promote \
  restore

# 4. Verify row counts match expectations
kubectl exec -n tpt-banking postgres-0 -- psql -U tpt_banking tpt_banking -c \
  "SELECT COUNT(*) FROM accounts; SELECT COUNT(*) FROM journals;"

# 5. Resume traffic
kubectl scale deployment api-gateway --replicas=2 -n tpt-banking

# 6. Run migration:run to ensure schema is at head
kubectl exec -n tpt-banking deploy/banking-core -- \
  npm run migration:run
```

---

### 3. Corruption detection checklist

Run after any suspect incident:

```sql
-- Check for orphaned ledger entries (should return 0)
SELECT COUNT(*) FROM ledger_entries le
LEFT JOIN journals j ON j.id = le.journal_id
WHERE j.id IS NULL;

-- Check double-entry balance (sum of all ledger entries must be 0)
SELECT SUM(amount) FROM ledger_entries;

-- Check account balances match trigger-maintained values
SELECT a.id, a.balance, COALESCE(SUM(le.amount), 0) AS ledger_sum
FROM accounts a
LEFT JOIN ledger_entries le ON le.account_id = a.id
GROUP BY a.id, a.balance
HAVING a.balance <> COALESCE(SUM(le.amount), 0);
```

Any non-zero rows indicate corruption — **do not resume traffic; escalate immediately.**

---

### 4. Backup verification (monthly)

```bash
# Restore yesterday's backup to the DR staging namespace
kubectl create namespace tpt-banking-dr 2>/dev/null || true
# ... restore procedure as in PITR above, targeting staging cluster
# Verify row counts match production snapshot
# Document results in the DR test log
```
