import {
  BankingError,
  CurrencyMismatchError,
  DivisionByZeroError,
  InsufficientFundsError,
  AccountNotFoundError,
  AccountStatusError,
  CustomerNotFoundError,
  DuplicateTransactionError,
  ValidationError,
  UnbalancedJournalError,
  SagaCompensationError,
  JournalNotFoundError,
  JournalAlreadyReversedError,
} from '../errors';

describe('BankingError hierarchy', () => {
  describe('BankingError (base)', () => {
    it('is an instance of Error', () => {
      const err = new BankingError('oops', 'TEST', 400);
      expect(err).toBeInstanceOf(Error);
    });

    it('sets message, code, statusCode', () => {
      const err = new BankingError('test message', 'MY_CODE', 422);
      expect(err.message).toBe('test message');
      expect(err.code).toBe('MY_CODE');
      expect(err.statusCode).toBe(422);
    });

    it('preserves details', () => {
      const err = new BankingError('msg', 'CODE', 400, { field: 'amount' });
      expect(err.details).toEqual({ field: 'amount' });
    });

    it('sets constructor name as error name', () => {
      const err = new BankingError('msg', 'CODE', 400);
      expect(err.name).toBe('BankingError');
    });

    it('restores prototype chain for instanceof checks', () => {
      const err = new BankingError('msg', 'CODE', 400);
      expect(err instanceof BankingError).toBe(true);
    });
  });

  describe('CurrencyMismatchError', () => {
    it('extends BankingError', () => {
      const err = new CurrencyMismatchError('msg', 'USD', 'EUR');
      expect(err).toBeInstanceOf(BankingError);
    });

    it('code is CURRENCY_MISMATCH and statusCode is 422', () => {
      const err = new CurrencyMismatchError('mismatch', 'USD', 'EUR');
      expect(err.code).toBe('CURRENCY_MISMATCH');
      expect(err.statusCode).toBe(422);
    });

    it('exposes fromCurrency and toCurrency', () => {
      const err = new CurrencyMismatchError('msg', 'GBP', 'JPY');
      expect(err.fromCurrency).toBe('GBP');
      expect(err.toCurrency).toBe('JPY');
    });
  });

  describe('DivisionByZeroError', () => {
    it('code is DIVISION_BY_ZERO and statusCode is 422', () => {
      const err = new DivisionByZeroError();
      expect(err.code).toBe('DIVISION_BY_ZERO');
      expect(err.statusCode).toBe(422);
    });

    it('uses default message when none provided', () => {
      expect(new DivisionByZeroError().message).toBe('Division by zero is not allowed');
    });

    it('accepts custom message', () => {
      expect(new DivisionByZeroError('custom').message).toBe('custom');
    });
  });

  describe('InsufficientFundsError', () => {
    const err = new InsufficientFundsError('acct-1', '500', '100', 'USD');

    it('code is INSUFFICIENT_FUNDS and statusCode is 422', () => {
      expect(err.code).toBe('INSUFFICIENT_FUNDS');
      expect(err.statusCode).toBe(422);
    });

    it('exposes accountId, requested, available', () => {
      expect(err.accountId).toBe('acct-1');
      expect(err.requested).toBe('500');
      expect(err.available).toBe('100');
    });

    it('message contains account ID and amounts', () => {
      expect(err.message).toContain('acct-1');
      expect(err.message).toContain('500');
      expect(err.message).toContain('100');
      expect(err.message).toContain('USD');
    });
  });

  describe('AccountNotFoundError', () => {
    it('code is ACCOUNT_NOT_FOUND and statusCode is 404', () => {
      const err = new AccountNotFoundError('acct-999');
      expect(err.code).toBe('ACCOUNT_NOT_FOUND');
      expect(err.statusCode).toBe(404);
    });

    it('message contains identifier', () => {
      const err = new AccountNotFoundError('my-account-id');
      expect(err.message).toContain('my-account-id');
    });
  });

  describe('AccountStatusError', () => {
    it('includes current status in message', () => {
      const err = new AccountStatusError('acct-1', 'SUSPENDED');
      expect(err.message).toContain('SUSPENDED');
      expect(err.code).toBe('ACCOUNT_STATUS_ERROR');
      expect(err.statusCode).toBe(422);
    });

    it('includes required status when provided', () => {
      const err = new AccountStatusError('acct-1', 'SUSPENDED', 'ACTIVE');
      expect(err.message).toContain('ACTIVE');
    });
  });

  describe('CustomerNotFoundError', () => {
    it('code is CUSTOMER_NOT_FOUND and statusCode is 404', () => {
      const err = new CustomerNotFoundError('CIF-12345678');
      expect(err.code).toBe('CUSTOMER_NOT_FOUND');
      expect(err.statusCode).toBe(404);
    });
  });

  describe('DuplicateTransactionError', () => {
    it('code is DUPLICATE_TRANSACTION and statusCode is 409', () => {
      const err = new DuplicateTransactionError('idem-key-1');
      expect(err.code).toBe('DUPLICATE_TRANSACTION');
      expect(err.statusCode).toBe(409);
    });

    it('exposes idempotencyKey', () => {
      const err = new DuplicateTransactionError('key-xyz');
      expect(err.idempotencyKey).toBe('key-xyz');
    });
  });

  describe('ValidationError', () => {
    it('code is VALIDATION_ERROR and statusCode is 400', () => {
      const err = new ValidationError('invalid amount');
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.statusCode).toBe(400);
    });

    it('exposes optional field', () => {
      const err = new ValidationError('bad value', 'amount');
      expect(err.field).toBe('amount');
    });
  });

  describe('UnbalancedJournalError', () => {
    it('code is UNBALANCED_JOURNAL and statusCode is 422', () => {
      const err = new UnbalancedJournalError('USD', '1000', '900');
      expect(err.code).toBe('UNBALANCED_JOURNAL');
      expect(err.statusCode).toBe(422);
    });

    it('message includes currency and amounts', () => {
      const err = new UnbalancedJournalError('USD', '1000', '900');
      expect(err.message).toContain('USD');
      expect(err.message).toContain('1000');
      expect(err.message).toContain('900');
    });
  });

  describe('SagaCompensationError', () => {
    it('code is SAGA_COMPENSATION_ERROR and statusCode is 500', () => {
      const err = new SagaCompensationError('saga-1', 'HOLD_FUNDS');
      expect(err.code).toBe('SAGA_COMPENSATION_ERROR');
      expect(err.statusCode).toBe(500);
    });

    it('exposes sagaId and failedStep', () => {
      const err = new SagaCompensationError('saga-abc', 'POST_JOURNAL');
      expect(err.sagaId).toBe('saga-abc');
      expect(err.failedStep).toBe('POST_JOURNAL');
    });

    it('includes cause when provided', () => {
      const err = new SagaCompensationError('saga-1', 'HOLD', 'DB timeout');
      expect(err.message).toContain('DB timeout');
    });
  });

  describe('JournalNotFoundError', () => {
    it('statusCode is 404', () => {
      expect(new JournalNotFoundError('jrn-1').statusCode).toBe(404);
    });
  });

  describe('JournalAlreadyReversedError', () => {
    it('statusCode is 409', () => {
      expect(new JournalAlreadyReversedError('jrn-1').statusCode).toBe(409);
    });
  });

  // ─── Prototype chain integrity ────────────────────────────────────────────────

  describe('prototype chain', () => {
    it('all errors are instanceof BankingError', () => {
      const errors: BankingError[] = [
        new CurrencyMismatchError('m', 'USD', 'EUR'),
        new DivisionByZeroError(),
        new InsufficientFundsError('a', '1', '0', 'USD'),
        new AccountNotFoundError('a'),
        new AccountStatusError('a', 'SUSPENDED'),
        new CustomerNotFoundError('c'),
        new DuplicateTransactionError('k'),
        new ValidationError('v'),
        new UnbalancedJournalError('USD', '1', '0'),
        new SagaCompensationError('s', 'step'),
        new JournalNotFoundError('j'),
        new JournalAlreadyReversedError('j'),
      ];

      for (const err of errors) {
        expect(err).toBeInstanceOf(BankingError);
        expect(err).toBeInstanceOf(Error);
      }
    });
  });
});
