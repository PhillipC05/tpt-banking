# Kafka Disaster Recovery Runbook

## Replication safety

Production Kafka runs with **3 brokers, replication factor 3, min.insync.replicas=2**. One broker can fail without data loss. Two simultaneous broker failures may cause data loss depending on in-flight messages.

The `audit.log` topic has **7-year retention** and must never be deleted.

---

## Scenario 1 — Single broker failure

```bash
# 1. Identify the failed broker
kubectl get pods -n tpt-banking -l app=kafka

# 2. Check consumer group lag before action
kubectl exec -n tpt-banking kafka-0 -- \
  kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --all-groups --describe | grep -v "0$"

# 3. Let Kubernetes restart the pod — StatefulSet will auto-recover
kubectl rollout restart statefulset/kafka -n tpt-banking --index=<N>

# 4. After restart, verify broker re-joined cluster
kubectl exec -n tpt-banking kafka-0 -- \
  kafka-broker-api-versions.sh --bootstrap-server kafka:9092

# 5. Check under-replicated partitions (should return 0)
kubectl exec -n tpt-banking kafka-0 -- \
  kafka-topics.sh --bootstrap-server kafka:9092 \
  --describe --under-replicated-partitions
```

---

## Scenario 2 — All brokers lost (complete Kafka failure)

This is a Tier 1 incident. Escalate to engineering lead immediately.

```bash
# 1. Scale down all Kafka-producing apps to stop writes
kubectl scale deployment banking-core compliance open-banking \
  investment-banking --replicas=0 -n tpt-banking

# 2. Restore Zookeeper first (if also lost)
kubectl rollout restart statefulset/zookeeper -n tpt-banking
# Wait for zookeeper to become healthy
kubectl wait pod/zookeeper-0 -n tpt-banking --for=condition=Ready --timeout=120s

# 3. Restore Kafka brokers
kubectl rollout restart statefulset/kafka -n tpt-banking
kubectl wait pod/kafka-0 kafka-1 kafka-2 -n tpt-banking --for=condition=Ready --timeout=180s

# 4. Re-create topics if PVC data was lost
# (audit.log has 7-year retention — this topic MUST be recreated with correct config)
kubectl exec -n tpt-banking kafka-0 -- kafka-topics.sh \
  --bootstrap-server kafka:9092 --create \
  --topic audit.log \
  --replication-factor 3 \
  --partitions 12 \
  --config retention.ms=220752000000   # 7 years in ms

# Re-create all other topics (refer to packages/kafka/src/topics.ts for names)
# Use replication-factor 3, partitions scaled to throughput requirements

# 5. Resume producing apps
kubectl scale deployment banking-core compliance open-banking \
  investment-banking --replicas=3 -n tpt-banking

# 6. Assess message loss window — check PostgreSQL for unacknowledged operations
# Any transactions that posted to DB but whose Kafka events were lost must be
# re-emitted. Use the following query to find transactions in the loss window:
kubectl exec -n tpt-banking postgres-0 -- psql -U tpt_banking tpt_banking -c "
  SELECT id, amount, created_at 
  FROM journals 
  WHERE created_at BETWEEN '<kafka_down_time>' AND '<kafka_restored_time>'
  ORDER BY created_at;"
```

---

## audit.log protection

The `audit.log` topic must be protected from accidental deletion:

```bash
# Lock the audit.log topic against deletion
kubectl exec -n tpt-banking kafka-0 -- kafka-configs.sh \
  --bootstrap-server kafka:9092 \
  --entity-type topics \
  --entity-name audit.log \
  --alter \
  --add-config delete.topic.enable=false
```

Verify this config is applied after every cluster restore.

---

## Consumer lag monitoring

Alert threshold: consumer group lag > 10,000 messages on any topic.

```bash
# Monitor lag continuously
watch -n 10 'kubectl exec -n tpt-banking kafka-0 -- \
  kafka-consumer-groups.sh --bootstrap-server kafka:9092 \
  --all-groups --describe 2>/dev/null | awk "{if(\$6>10000) print \$0}"'
```
