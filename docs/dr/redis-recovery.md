# Redis Disaster Recovery Runbook

## Data criticality

| Redis key space | Data type | Recovery strategy |
|-----------------|-----------|-------------------|
| `idempotency:*` | 24-hour response cache | Lose — clients will replay; new responses cached |
| `step-up:*` | Step-up auth tokens (5 min TTL) | Lose — users re-authenticate |
| `refresh:*` | Refresh token families | Lose — users re-login (acceptable) |
| `throttle:*` | Rate limit counters | Lose — rate limits reset (acceptable) |
| `quotes:*` | Pricing engine quote cache | Lose — pricing engine rebuilds from market data feed |

**Redis is not a source of truth for any financial data.** Losing Redis is inconvenient but not catastrophic. No PITR required.

---

## Scenario 1 — Redis pod restart / OOM kill

Redis uses AOF persistence (`appendonly yes`). On restart, data is replayed from the AOF log.

```bash
# 1. Check pod status
kubectl get pod -n tpt-banking -l app=redis

# 2. If CrashLoopBackOff, describe the pod
kubectl describe pod -n tpt-banking redis-0

# 3. If OOM killed, increase memory limit in StatefulSet
kubectl edit statefulset redis -n tpt-banking
# Increase resources.limits.memory (e.g., 2Gi → 4Gi)

# 4. After pod restarts, verify connectivity
kubectl exec -n tpt-banking redis-0 -- redis-cli ping
# Expected: PONG

# 5. Verify idempotency keys are intact (spot check)
kubectl exec -n tpt-banking redis-0 -- redis-cli --scan --pattern 'idempotency:*' | head -5
```

---

## Scenario 2 — Complete Redis data loss

```bash
# 1. Restart all apps so they rebuild Redis state organically
kubectl rollout restart deployment -n tpt-banking

# 2. Pricing engine — force market data refresh
curl -X POST http://pricing-engine:3005/v1/market-data/refresh

# 3. Notify clients: "Sessions expired, please log in again"
#    (refresh tokens lost; users must re-authenticate)

# 4. Monitor for duplicate transaction processing over next 24h
#    Idempotency keys lost — watch for duplicates in journal table:
kubectl exec -n tpt-banking postgres-0 -- psql -U tpt_banking tpt_banking -c "
  SELECT idempotency_key, COUNT(*) 
  FROM journals 
  WHERE created_at > NOW() - INTERVAL '1 hour'
  GROUP BY idempotency_key 
  HAVING COUNT(*) > 1;"
```

---

## Redis Sentinel / Cluster upgrade path

The current StatefulSet runs a single Redis instance suitable for development and moderate production load. For high-availability production:

1. Migrate to Redis Sentinel (3 nodes: 1 primary + 2 replicas) or Redis Cluster (6 nodes: 3 primary + 3 replicas)
2. Update `REDIS_HOST` in ConfigMap to the Sentinel sentinel endpoint or cluster endpoint
3. Update `@nestjs-modules/ioredis` config to use Sentinel/Cluster mode
