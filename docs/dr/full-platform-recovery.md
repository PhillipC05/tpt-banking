# Full Platform Recovery Runbook

## Trigger conditions

This runbook applies when the entire production environment is unavailable (cluster loss, catastrophic provider outage, ransomware).

**Estimated RTO: 90 minutes** (with pre-positioned DR environment and recent backups).

---

## Pre-requisites

Before following this runbook, confirm:
- [ ] DR Kubernetes cluster is available (secondary region)
- [ ] Latest PostgreSQL base backup is accessible in S3/GCS
- [ ] Kafka data is replicated (MirrorMaker 2) or topic list + schema is documented
- [ ] Secrets are stored in Vault / external secret store (not only in the cluster)
- [ ] Docker images are available in container registry

---

## Step 1 — Declare incident (0:00)

```
1. Page on-call engineer + engineering lead
2. Open incident channel: #incident-YYYY-MM-DD-platform
3. Start incident timer
4. Set status page to "Investigating"
```

---

## Step 2 — Activate DR cluster (0:05)

```bash
# Switch kubectl context to DR cluster
kubectl config use-context tpt-banking-dr

# Verify DR cluster is healthy
kubectl get nodes
kubectl get namespaces
```

---

## Step 3 — Restore secrets (0:10)

```bash
# Option A: Restore from Vault (if Vault is in DR cluster or external)
vault kv get secret/tpt-banking > /tmp/secrets.json
kubectl create secret generic tpt-banking-secrets \
  --from-file=/tmp/secrets.json -n tpt-banking
shred -u /tmp/secrets.json

# Option B: Re-populate manually from break-glass document
# Location: [REDACTED — stored in physical safe + encrypted offsite]
kubectl apply -f infra/k8s/secret.yaml  # after filling in values
```

---

## Step 4 — Restore infrastructure (0:15)

```bash
# Apply namespace + config
kubectl apply -f infra/k8s/namespace.yaml
kubectl apply -f infra/k8s/configmap.yaml

# Start stateful services
kubectl apply -f infra/k8s/infra/postgres.yaml
kubectl apply -f infra/k8s/infra/redis.yaml
kubectl apply -f infra/k8s/infra/kafka.yaml

# Wait for postgres to be ready
kubectl wait pod/postgres-0 -n tpt-banking --for=condition=Ready --timeout=120s
```

---

## Step 5 — Restore PostgreSQL data (0:20)

Follow [postgres-recovery.md — PITR section](postgres-recovery.md), targeting the latest clean backup.

```bash
# Verify row counts match last known good snapshot
kubectl exec -n tpt-banking postgres-0 -- psql -U tpt_banking tpt_banking -c \
  "SELECT relname, n_live_tup FROM pg_stat_user_tables ORDER BY n_live_tup DESC LIMIT 20;"

# Run migrations to head
kubectl apply -f infra/k8s/apps/banking-core.yaml
kubectl exec -n tpt-banking deploy/banking-core -- npm run migration:run
```

---

## Step 6 — Re-create Kafka topics (0:40)

```bash
# Wait for Kafka to be ready
kubectl wait pod/kafka-0 -n tpt-banking --for=condition=Ready --timeout=180s

# Re-create audit.log topic with 7-year retention
kubectl exec -n tpt-banking kafka-0 -- kafka-topics.sh \
  --bootstrap-server kafka:9092 --create \
  --topic audit.log \
  --replication-factor 3 \
  --partitions 12 \
  --config retention.ms=220752000000

# Re-create remaining topics (from packages/kafka/src/topics.ts)
for topic in transactions.created transfers.initiated transfers.completed \
             transfers.failed payments.ach.initiated kyc.completed \
             aml.alert.created cases.created sar.filed ctr.filed \
             cards.authorized orders.created positions.updated; do
  kubectl exec -n tpt-banking kafka-0 -- kafka-topics.sh \
    --bootstrap-server kafka:9092 --create \
    --topic $topic \
    --replication-factor 3 \
    --partitions 6 \
    --if-not-exists
done
```

---

## Step 7 — Deploy applications (0:50)

```bash
kubectl apply -k infra/k8s/

# Monitor rollout
kubectl rollout status deployment -n tpt-banking --timeout=300s
```

---

## Step 8 — Smoke test (1:05)

```bash
k6 run tests/load/smoke.js \
  -e BANKING_CORE_URL=http://<dr-cluster-ip>:3000 \
  -e API_GATEWAY_URL=http://<dr-cluster-ip>:3001
```

All checks must pass before traffic is restored.

---

## Step 9 — Restore traffic (1:15)

```bash
# Update DNS / load balancer to point to DR cluster
# (provider-specific — document your DNS failover procedure here)

# Set status page to "Resolved"
# Notify affected customers if financial data window > 0
```

---

## Step 10 — Post-incident (after recovery)

- [ ] Preserve logs and forensic evidence before cleanup
- [ ] Root cause analysis within 48 hours
- [ ] Regulatory notification if required (see compliance team)
- [ ] DR test gaps identified and scheduled
- [ ] Update this runbook with lessons learned
