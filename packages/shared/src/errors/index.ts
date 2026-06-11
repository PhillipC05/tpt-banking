/**
 * Base error class for all TPT Banking domain errors.
 * All domain errors extend this class to provide consistent
 * error codes, HTTP status codes, and optional details.
 */
export class BankingError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;

    // Restore prototype chain (required when extending built-in classes in TS)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when an operation is attempted between two Money objects
 * with different currency codes.
 */
export class CurrencyMismatchError extends BankingError {
  public readonly fromCurrency: string;
  public readonly toCurrency: string;

  constructor(message: string, fromCurrency: string, toCurrency: string) {
    super(message, 'CURRENCY_MISMATCH', 422, { fromCurrency, toCurrency });
    this.fromCurrency = fromCurrency;
    this.toCurrency = toCurrency;
  }
}

/**
 * Thrown when a division by zero is attempted in Money arithmetic.
 */
export class DivisionByZeroError extends BankingError {
  constructor(message = 'Division by zero is not allowed') {
    super(message, 'DIVISION_BY_ZERO', 422);
  }
}

/**
 * Thrown when a debit operation would result in the account balance
 * dropping below the allowed minimum (considering overdraft limits).
 */
export class InsufficientFundsError extends BankingError {
  public readonly accountId: string;
  public readonly requested: string;
  public readonly available: string;

  constructor(
    accountId: string,
    requested: string,
    available: string,
    currency: string,
  ) {
    super(
      `Insufficient funds in account ${accountId}: requested ${requested} ${currency}, available ${available} ${currency}`,
      'INSUFFICIENT_FUNDS',
      422,
      { accountId, requested, available, currency },
    );
    this.accountId = accountId;
    this.requested = requested;
    this.available = available;
  }
}

/**
 * Thrown when an account lookup fails.
 */
export class AccountNotFoundError extends BankingError {
  public readonly identifier: string;

  constructor(identifier: string) {
    super(
      `Account not found: ${identifier}`,
      'ACCOUNT_NOT_FOUND',
      404,
      { identifier },
    );
    this.identifier = identifier;
  }
}

/**
 * Thrown when a request with a duplicate idempotency key is detected
 * but the payload differs from the original request.
 */
export class DuplicateTransactionError extends BankingError {
  public readonly idempotencyKey: string;

  constructor(idempotencyKey: string) {
    super(
      `A transaction with idempotency key "${idempotencyKey}" already exists`,
      'DUPLICATE_TRANSACTION',
      409,
      { idempotencyKey },
    );
    this.idempotencyKey = idempotencyKey;
  }
}

/**
 * Thrown when input validation fails at the domain level.
 */
export class ValidationError extends BankingError {
  public readonly field?: string;

  constructor(
    message: string,
    field?: string,
    details?: Record<string, unknown>,
  ) {
    super(message, 'VALIDATION_ERROR', 400, { field, ...details });
    this.field = field;
  }
}

/**
 * Thrown when an operation is attempted on an account that is not ACTIVE.
 */
export class AccountStatusError extends BankingError {
  constructor(accountId: string, currentStatus: string, requiredStatus?: string) {
    super(
      requiredStatus
        ? `Account ${accountId} is ${currentStatus}, expected ${requiredStatus}`
        : `Account ${accountId} is not in a state that allows this operation (current: ${currentStatus})`,
      'ACCOUNT_STATUS_ERROR',
      422,
      { accountId, currentStatus, requiredStatus },
    );
  }
}

/**
 * Thrown when a customer lookup fails.
 */
export class CustomerNotFoundError extends BankingError {
  constructor(identifier: string) {
    super(
      `Customer not found: ${identifier}`,
      'CUSTOMER_NOT_FOUND',
      404,
      { identifier },
    );
  }
}

/**
 * Thrown when a ledger journal is unbalanced (debits ≠ credits).
 */
export class UnbalancedJournalError extends BankingError {
  constructor(currency: string, debitTotal: string, creditTotal: string) {
    super(
      `Journal entries are unbalanced for currency ${currency}: debits=${debitTotal}, credits=${creditTotal}`,
      'UNBALANCED_JOURNAL',
      422,
      { currency, debitTotal, creditTotal },
    );
  }
}

/**
 * Thrown when a saga step fails and compensation is required.
 */
export class SagaCompensationError extends BankingError {
  public readonly sagaId: string;
  public readonly failedStep: string;

  constructor(sagaId: string, failedStep: string, cause?: string) {
    super(
      `Saga ${sagaId} failed at step "${failedStep}"${cause ? `: ${cause}` : ''}`,
      'SAGA_COMPENSATION_ERROR',
      500,
      { sagaId, failedStep, cause },
    );
    this.sagaId = sagaId;
    this.failedStep = failedStep;
  }
}

/**
 * Thrown when a requested journal cannot be found.
 */
export class JournalNotFoundError extends BankingError {
  constructor(journalId: string) {
    super(
      `Journal not found: ${journalId}`,
      'JOURNAL_NOT_FOUND',
      404,
      { journalId },
    );
  }
}

/**
 * Thrown when attempting to reverse an already-reversed journal.
 */
export class JournalAlreadyReversedError extends BankingError {
  constructor(journalId: string) {
    super(
      `Journal ${journalId} has already been reversed`,
      'JOURNAL_ALREADY_REVERSED',
      409,
      { journalId },
    );
  }
}
