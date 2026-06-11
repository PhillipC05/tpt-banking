import Decimal from 'decimal.js';
import { CurrencyMismatchError, DivisionByZeroError } from '../errors';

/**
 * Immutable Money value object.
 * All financial arithmetic MUST use this class — never raw numbers.
 * Internally backed by decimal.js for arbitrary-precision decimal arithmetic.
 */
export class Money {
  private readonly _amount: Decimal;
  private readonly _currency: string;

  constructor(amount: number | string | Decimal, currency: string) {
    if (!currency || currency.trim().length === 0) {
      throw new Error('Currency code must not be empty');
    }
    this._currency = currency.trim().toUpperCase();
    this._amount = new Decimal(amount);
  }

  // ─── Accessors ───────────────────────────────────────────────────────────────

  get currency(): string {
    return this._currency;
  }

  get amount(): Decimal {
    return this._amount;
  }

  // ─── Arithmetic ──────────────────────────────────────────────────────────────

  /**
   * Adds two Money values of the same currency.
   * @throws CurrencyMismatchError if currencies differ
   */
  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._amount.plus(other._amount), this._currency);
  }

  /**
   * Subtracts another Money value from this one.
   * @throws CurrencyMismatchError if currencies differ
   */
  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this._amount.minus(other._amount), this._currency);
  }

  /**
   * Multiplies this Money by a scalar factor.
   * Useful for applying rates, fees, and percentages.
   */
  multiply(factor: number | string): Money {
    return new Money(this._amount.times(new Decimal(factor)), this._currency);
  }

  /**
   * Divides this Money by a scalar divisor.
   * @throws DivisionByZeroError if divisor is zero
   */
  divide(divisor: number | string): Money {
    const d = new Decimal(divisor);
    if (d.isZero()) {
      throw new DivisionByZeroError('Cannot divide money by zero');
    }
    return new Money(this._amount.dividedBy(d), this._currency);
  }

  /**
   * Returns the absolute (non-negative) value.
   */
  abs(): Money {
    return new Money(this._amount.abs(), this._currency);
  }

  /**
   * Returns the negated value (flips sign).
   */
  negate(): Money {
    return new Money(this._amount.negated(), this._currency);
  }

  // ─── Predicates ──────────────────────────────────────────────────────────────

  isZero(): boolean {
    return this._amount.isZero();
  }

  isPositive(): boolean {
    return this._amount.isPositive() && !this._amount.isZero();
  }

  isNegative(): boolean {
    return this._amount.isNegative();
  }

  // ─── Comparisons ─────────────────────────────────────────────────────────────

  /**
   * @throws CurrencyMismatchError if currencies differ
   */
  equals(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount.equals(other._amount);
  }

  /**
   * @throws CurrencyMismatchError if currencies differ
   */
  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount.greaterThan(other._amount);
  }

  /**
   * @throws CurrencyMismatchError if currencies differ
   */
  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount.lessThan(other._amount);
  }

  /**
   * @throws CurrencyMismatchError if currencies differ
   */
  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount.greaterThanOrEqualTo(other._amount);
  }

  /**
   * @throws CurrencyMismatchError if currencies differ
   */
  lessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this._amount.lessThanOrEqualTo(other._amount);
  }

  // ─── Serialisation ───────────────────────────────────────────────────────────

  /**
   * Returns the decimal string representation suitable for PostgreSQL NUMERIC storage.
   * Always includes the full precision without scientific notation.
   */
  toDecimalString(): string {
    return this._amount.toFixed();
  }

  /**
   * Returns the numeric value as a JavaScript number.
   * WARNING: Use ONLY for display purposes. Do not perform arithmetic on this value.
   * Large values may lose precision.
   */
  toNumber(): number {
    return this._amount.toNumber();
  }

  /**
   * Returns a human-readable string formatted with the currency code.
   */
  toString(): string {
    return `${this._amount.toFixed(2)} ${this._currency}`;
  }

  // ─── Static Factories ────────────────────────────────────────────────────────

  /**
   * Creates a Money instance with a zero amount for the given currency.
   */
  static zero(currency: string): Money {
    return new Money(new Decimal(0), currency);
  }

  /**
   * Creates a Money instance from a decimal string (e.g. from PostgreSQL NUMERIC column).
   */
  static fromDecimalString(value: string, currency: string): Money {
    return new Money(new Decimal(value), currency);
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this._currency !== other._currency) {
      throw new CurrencyMismatchError(
        `Currency mismatch: cannot operate on ${this._currency} and ${other._currency}`,
        this._currency,
        other._currency,
      );
    }
  }
}
