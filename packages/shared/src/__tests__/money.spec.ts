import Decimal from 'decimal.js';
import { Money } from '../types/money';
import { CurrencyMismatchError, DivisionByZeroError } from '../errors';

describe('Money', () => {
  // ─── Construction ────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('creates from number', () => {
      const m = new Money(100, 'USD');
      expect(m.toDecimalString()).toBe('100');
      expect(m.currency).toBe('USD');
    });

    it('creates from string', () => {
      const m = new Money('9999.99', 'EUR');
      expect(m.toDecimalString()).toBe('9999.99');
    });

    it('creates from Decimal', () => {
      const m = new Money(new Decimal('0.001'), 'GBP');
      expect(m.toDecimalString()).toBe('0.001');
    });

    it('normalises currency code to uppercase', () => {
      expect(new Money(1, 'usd').currency).toBe('USD');
      expect(new Money(1, 'Eur').currency).toBe('EUR');
    });

    it('throws on empty currency', () => {
      expect(() => new Money(1, '')).toThrow('Currency code must not be empty');
    });

    it('throws on whitespace-only currency', () => {
      expect(() => new Money(1, '  ')).toThrow('Currency code must not be empty');
    });
  });

  // ─── Factories ───────────────────────────────────────────────────────────────

  describe('zero()', () => {
    it('creates a zero Money value', () => {
      const m = Money.zero('USD');
      expect(m.isZero()).toBe(true);
      expect(m.currency).toBe('USD');
    });
  });

  describe('fromDecimalString()', () => {
    it('round-trips a decimal string', () => {
      const original = '12345.6789';
      const m = Money.fromDecimalString(original, 'JPY');
      expect(m.toDecimalString()).toBe(original);
    });
  });

  // ─── Arithmetic ──────────────────────────────────────────────────────────────

  describe('add()', () => {
    it('adds two same-currency values', () => {
      const a = new Money('100.50', 'USD');
      const b = new Money('200.25', 'USD');
      expect(a.add(b).toDecimalString()).toBe('300.75');
    });

    it('preserves full precision', () => {
      const a = new Money('0.1', 'USD');
      const b = new Money('0.2', 'USD');
      // Decimal.js avoids the infamous 0.1+0.2=0.30000000000000004 float error
      expect(a.add(b).toDecimalString()).toBe('0.3');
    });

    it('throws CurrencyMismatchError on different currencies', () => {
      const usd = new Money(100, 'USD');
      const eur = new Money(100, 'EUR');
      expect(() => usd.add(eur)).toThrow(CurrencyMismatchError);
    });
  });

  describe('subtract()', () => {
    it('subtracts same-currency values', () => {
      const a = new Money(500, 'USD');
      const b = new Money(200, 'USD');
      expect(a.subtract(b).toDecimalString()).toBe('300');
    });

    it('can produce negative results', () => {
      const a = new Money(100, 'USD');
      const b = new Money(200, 'USD');
      expect(a.subtract(b).isNegative()).toBe(true);
      expect(a.subtract(b).toDecimalString()).toBe('-100');
    });

    it('throws CurrencyMismatchError on different currencies', () => {
      expect(() => new Money(100, 'USD').subtract(new Money(50, 'GBP'))).toThrow(
        CurrencyMismatchError,
      );
    });
  });

  describe('multiply()', () => {
    it('multiplies by integer factor', () => {
      expect(new Money(100, 'USD').multiply(3).toDecimalString()).toBe('300');
    });

    it('multiplies by decimal factor', () => {
      expect(new Money('1000', 'USD').multiply('0.015').toDecimalString()).toBe('15');
    });

    it('multiplies by zero', () => {
      expect(new Money(999, 'USD').multiply(0).isZero()).toBe(true);
    });

    it('retains currency', () => {
      expect(new Money(50, 'EUR').multiply(2).currency).toBe('EUR');
    });
  });

  describe('divide()', () => {
    it('divides correctly', () => {
      expect(new Money(100, 'USD').divide(4).toDecimalString()).toBe('25');
    });

    it('produces fractional result', () => {
      expect(new Money(10, 'USD').divide(3).toDecimalString()).toMatch(/^3\.333/);
    });

    it('throws DivisionByZeroError', () => {
      expect(() => new Money(100, 'USD').divide(0)).toThrow(DivisionByZeroError);
    });

    it('throws DivisionByZeroError for string "0"', () => {
      expect(() => new Money(100, 'USD').divide('0')).toThrow(DivisionByZeroError);
    });
  });

  describe('abs()', () => {
    it('returns absolute value of negative', () => {
      expect(new Money(-50, 'USD').abs().toDecimalString()).toBe('50');
    });

    it('does not change positive value', () => {
      expect(new Money(50, 'USD').abs().toDecimalString()).toBe('50');
    });
  });

  describe('negate()', () => {
    it('negates a positive value', () => {
      expect(new Money(100, 'USD').negate().toDecimalString()).toBe('-100');
    });

    it('negates a negative value', () => {
      expect(new Money(-100, 'USD').negate().toDecimalString()).toBe('100');
    });
  });

  // ─── Predicates ──────────────────────────────────────────────────────────────

  describe('isZero()', () => {
    it('returns true for zero', () => expect(Money.zero('USD').isZero()).toBe(true));
    it('returns false for non-zero', () => expect(new Money(0.001, 'USD').isZero()).toBe(false));
  });

  describe('isPositive()', () => {
    it('true for positive', () => expect(new Money(0.01, 'USD').isPositive()).toBe(true));
    it('false for zero', () => expect(Money.zero('USD').isPositive()).toBe(false));
    it('false for negative', () => expect(new Money(-1, 'USD').isPositive()).toBe(false));
  });

  describe('isNegative()', () => {
    it('true for negative', () => expect(new Money(-0.01, 'USD').isNegative()).toBe(true));
    it('false for zero', () => expect(Money.zero('USD').isNegative()).toBe(false));
    it('false for positive', () => expect(new Money(1, 'USD').isNegative()).toBe(false));
  });

  // ─── Comparisons ─────────────────────────────────────────────────────────────

  describe('equals()', () => {
    it('equal values', () => {
      expect(new Money('100.00', 'USD').equals(new Money('100', 'USD'))).toBe(true);
    });

    it('unequal values', () => {
      expect(new Money(100, 'USD').equals(new Money(101, 'USD'))).toBe(false);
    });

    it('throws on currency mismatch', () => {
      expect(() => new Money(100, 'USD').equals(new Money(100, 'EUR'))).toThrow(
        CurrencyMismatchError,
      );
    });
  });

  describe('greaterThan() / lessThan()', () => {
    it('greaterThan is correct', () => {
      expect(new Money(200, 'USD').greaterThan(new Money(100, 'USD'))).toBe(true);
      expect(new Money(100, 'USD').greaterThan(new Money(200, 'USD'))).toBe(false);
    });

    it('lessThan is correct', () => {
      expect(new Money(50, 'USD').lessThan(new Money(100, 'USD'))).toBe(true);
    });

    it('greaterThanOrEqual handles equality', () => {
      expect(new Money(100, 'USD').greaterThanOrEqual(new Money(100, 'USD'))).toBe(true);
    });

    it('lessThanOrEqual handles equality', () => {
      expect(new Money(100, 'USD').lessThanOrEqual(new Money(100, 'USD'))).toBe(true);
    });

    it('throws CurrencyMismatchError across currencies', () => {
      expect(() => new Money(100, 'USD').greaterThan(new Money(100, 'JPY'))).toThrow(
        CurrencyMismatchError,
      );
    });
  });

  // ─── Serialisation ───────────────────────────────────────────────────────────

  describe('toDecimalString()', () => {
    it('returns full precision without scientific notation', () => {
      expect(new Money('0.000001', 'USD').toDecimalString()).toBe('0.000001');
    });

    it('returns integer without trailing zeros', () => {
      expect(new Money('100.00', 'USD').toDecimalString()).toBe('100');
    });
  });

  describe('toString()', () => {
    it('formats to 2dp with currency code', () => {
      expect(new Money(1000, 'USD').toString()).toBe('1000.00 USD');
    });

    it('includes currency for non-USD', () => {
      expect(new Money('99.5', 'EUR').toString()).toBe('99.50 EUR');
    });
  });

  describe('toNumber()', () => {
    it('converts to JavaScript number', () => {
      expect(new Money('42.5', 'USD').toNumber()).toBe(42.5);
    });
  });

  // ─── Immutability ────────────────────────────────────────────────────────────

  describe('immutability', () => {
    it('add does not mutate original', () => {
      const a = new Money(100, 'USD');
      a.add(new Money(50, 'USD'));
      expect(a.toDecimalString()).toBe('100');
    });

    it('multiply does not mutate original', () => {
      const a = new Money(100, 'USD');
      a.multiply(3);
      expect(a.toDecimalString()).toBe('100');
    });
  });

  // ─── Domain scenario: loan fee calculation ───────────────────────────────────

  describe('domain scenario: monthly payment calculation', () => {
    it('calculates monthly interest correctly', () => {
      const principal = new Money('10000', 'USD');
      const annualRate = '0.12';
      const monthlyRate = new Decimal(annualRate).dividedBy(12).toFixed();
      const monthlyInterest = principal.multiply(monthlyRate);
      // 10000 * 0.12/12 = 10000 * 0.01 = 100
      expect(monthlyInterest.toDecimalString()).toBe('100');
    });
  });
});
