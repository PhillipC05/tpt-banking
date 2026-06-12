# Backup Procedures

## Schedule

| Component | Method | Frequency | Retention | Storage |
|-----------|--------|-----------|-----------|---------|
| PostgreSQL base backup | pgBackRest / WAL-G | Daily 02:00 UTC | 30 days | S3 (versioned) |
| PostgreSQL WAL streaming | Continuous archiving | Continuous | 7 days | S3 |
| Kafka `audit.log` topic | MirrorMaker 2 to S3 | Continuous | 7 years (regulatory) |
| Kafka other topics | Topic replication (3×) | Continuous | 7 days default |
| Vault secrets | Vault snapshot + encrypted export | Daily | 90 days | S3 (encrypted) |
| Kubernetes secrets backup | Velero | Daily | 30 days | S3 |
| Application config | Git (this repo) | On commit | Forever | GitHub |

---

## PostgreSQL Backup (pgBackRest)

### Initial setup (one-time)

```bash
# Install pgBackRest in the postgres pod (or sidecar)
# Configure /etc/pgbackrest/pgbackrest.conf:
cat > /etc/pgbackrest/pgbackrest.conf << EOF
[tpt-banking]
pg1-path=/var/lib/postgresql/data/pgdata

[global]
repo1-type=s3
repo1-s3-bucket=tpt-banking-backups
repo1-s3-region=us-east-1
repo1-s3-key=<AWS_ACCESS_KEY_ID>
repo1-s3-key-secret=<AWS_SECRET_ACCESS_KEY>
repo1-retention-full=30
repo1-retention-diff=7
repo1-cipher-type=aes-256-cbc
repo1-cipher-pass=<STRONG_PASSPHRASE>
EOF

# Create the stanza
pgbackrest --stanza=tpt-banking stanza-create
```

### Daily backup CronJob (Kubernetes)

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: tpt-banking
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: pgbackrest/pgbackrest:latest
              command:
                - pgbackrest
                - --stanza=tpt-banking
                - --type=full
                - backup
          restartPolicy: OnFailure
```

### Verify backup (monthly drill)

```bash
# Restore to DR namespace and verify
pgbackrest --stanza=tpt-banking --pg1-path=/tmp/dr-restore restore
psql -h /tmp/dr-restore -U tpt_banking tpt_banking -c \
  "SELECT COUNT(*) FROM accounts;"
# Compare with production count — must match within expected delta
```

---

## Kafka `audit.log` Long-Term Archival

The `audit.log` topic must be preserved for 7 years per BSA/AML regulations.

```bash
# MirrorMaker 2 config (mm2.properties) — runs as a Kubernetes Job
# Source: production Kafka cluster
# Target: S3 (via Kafka Connect S3 Sink Connector)

# Verify topic is being mirrored
kafka-consumer-groups.sh \
  --bootstrap-server kafka:9092 \
  --describe \
  --group mm2-source-audit-log
```

---

## Vault Snapshot

```bash
# Automated daily snapshot (Vault Enterprise) or manual:
vault operator raft snapshot save \
  s3://tpt-banking-backups/vault/vault-$(date +%Y%m%d).snap

# Encrypt with GPG before upload if using OSS Vault:
gpg --symmetric --cipher-algo AES256 vault-snapshot.snap
aws s3 cp vault-snapshot.snap.gpg s3://tpt-banking-backups/vault/
```

---

## Backup Monitoring & Alerts

Configure alerts for:
- PostgreSQL base backup > 26 hours old (missed backup)
- WAL archiving lag > 1 hour
- S3 bucket replication lag > 4 hours
- pgBackRest verify failure (weekly check)

```bash
# Weekly verify (add to CronJob, schedule: "0 4 * * 0")
pgbackrest --stanza=tpt-banking verify
```
