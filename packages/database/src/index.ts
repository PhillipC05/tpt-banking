export { AppDataSource } from './data-source';

// Migrations (for CLI reference)
export { InitialSchema1700000000000 } from './migrations/1700000000000-InitialSchema';
export { UsersAndTransactions1700000001000 } from './migrations/1700000001000-UsersAndTransactions';
export { Phase2Schema1700000002000 } from './migrations/1700000002000-Phase2Schema';
export { Phase3ComplianceSchema1700000003000 } from './migrations/1700000003000-Phase3ComplianceSchema';
export { Phase4RealtimeOpenBanking1700000004000 } from './migrations/1700000004000-Phase4RealtimeOpenBanking';
export { Phase5InvestmentBanking1700000005000 } from './migrations/1700000005000-Phase5InvestmentBanking';
export {
  Customer,
  CustomerStatus,
  CustomerTier,
  KycStatus,
} from './entities/customer.entity';
export { Account, AccountType, AccountStatus } from './entities/account.entity';
export { Journal, JournalType, JournalStatus } from './entities/journal.entity';
export { LedgerEntry, LedgerEntryType } from './entities/ledger-entry.entity';
export { Loan, LoanType, LoanStatus, AmortizationType } from './entities/loan.entity';
export { LoanPayment, LoanPaymentStatus, LoanPaymentType } from './entities/loan-payment.entity';
export { Card, CardType, CardStatus, CardNetwork } from './entities/card.entity';
export { CardTransaction, CardTransactionStatus, CardTransactionType } from './entities/card-transaction.entity';
export { AchPayment, AchDirection, AchStatus } from './entities/ach-payment.entity';
export { WireTransfer, WireType, WireStatus } from './entities/wire-transfer.entity';
// Phase 3 — Compliance
export { KycVerification, KycProvider, KycVerificationStatus, KycDocumentType } from './entities/kyc-verification.entity';
export { ScreeningResult, ScreeningType, ScreeningStatus, ScreeningTrigger } from './entities/screening-result.entity';
export { AmlAlert, AmlAlertStatus, AmlAlertSeverity, AmlRuleCode } from './entities/aml-alert.entity';
export { ComplianceCase, CaseType, CaseStatus, CasePriority } from './entities/compliance-case.entity';
export { Sar, SarStatus, SarSuspiciousActivityType } from './entities/sar.entity';
export { Ctr, CtrStatus } from './entities/ctr.entity';
