/**
 * All Kafka topic names used across the platform.
 * Pattern: <domain>.<subdomain>.<event-type>
 */
export const KafkaTopics = {
  // ─── Accounts ─────────────────────────────────────────────────────────────
  ACCOUNTS_CREATED: 'accounts.created',
  ACCOUNTS_STATUS_CHANGED: 'accounts.status-changed',
  ACCOUNTS_BALANCE_UPDATED: 'accounts.balance-updated',

  // ─── Customers ────────────────────────────────────────────────────────────
  CUSTOMERS_CREATED: 'customers.created',
  CUSTOMERS_KYC_STATUS_CHANGED: 'customers.kyc-status-changed',
  CUSTOMERS_TIER_CHANGED: 'customers.tier-changed',

  // ─── Transactions ──────────────────────────────────────────────────────────
  TRANSACTIONS_INITIATED: 'transactions.initiated',
  TRANSACTIONS_COMPLETED: 'transactions.completed',
  TRANSACTIONS_FAILED: 'transactions.failed',
  TRANSACTIONS_REVERSED: 'transactions.reversed',

  // ─── Ledger ───────────────────────────────────────────────────────────────
  LEDGER_JOURNAL_POSTED: 'ledger.journal-posted',
  LEDGER_JOURNAL_REVERSED: 'ledger.journal-reversed',

  // ─── Payments ─────────────────────────────────────────────────────────────
  PAYMENTS_ACH_INITIATED: 'payments.ach.initiated',
  PAYMENTS_ACH_COMPLETED: 'payments.ach.completed',
  PAYMENTS_ACH_FAILED: 'payments.ach.failed',
  PAYMENTS_WIRE_INITIATED: 'payments.wire.initiated',
  PAYMENTS_WIRE_COMPLETED: 'payments.wire.completed',
  PAYMENTS_SWIFT_INITIATED: 'payments.swift.initiated',
  PAYMENTS_RTP_INITIATED: 'payments.rtp.initiated',
  PAYMENTS_RTP_COMPLETED: 'payments.rtp.completed',

  // ─── Compliance ───────────────────────────────────────────────────────────
  COMPLIANCE_AML_ALERT_CREATED: 'compliance.aml.alert-created',
  COMPLIANCE_SAR_FILED: 'compliance.sar.filed',
  COMPLIANCE_CTR_FILED: 'compliance.ctr.filed',
  COMPLIANCE_SANCTIONS_HIT: 'compliance.sanctions.hit',

  // ─── Audit ────────────────────────────────────────────────────────────────
  /** Immutable audit log. Write-only, never delete, 7-year retention. */
  AUDIT_LOG: 'audit.log',

  // ─── Notifications ────────────────────────────────────────────────────────
  NOTIFICATIONS_EMAIL: 'notifications.email',
  NOTIFICATIONS_SMS: 'notifications.sms',
  NOTIFICATIONS_PUSH: 'notifications.push',

  // ─── Open Banking — outbound TPP webhooks ─────────────────────────────────
  /** Outbound webhook deliveries to TPP callback URLs. */
  OB_WEBHOOK_OUTBOUND: 'ob.webhook.outbound',
  OB_PAYMENT_SETTLED: 'ob.payment.settled',
  OB_PAYMENT_REJECTED: 'ob.payment.rejected',
  OB_CONSENT_REVOKED: 'ob.consent.revoked',

  // ─── Integration framework — inbound provider webhooks ───────────────────
  /** Inbound provider webhooks that have passed signature validation. */
  INTEGRATION_WEBHOOK_RECEIVED: 'integration.webhook.received',
  /** Dead-letter queue for inbound webhooks that failed handler processing 3× */
  INTEGRATION_WEBHOOK_DLQ: 'integration.webhook.dlq',
} as const;

export type KafkaTopic = (typeof KafkaTopics)[keyof typeof KafkaTopics];
