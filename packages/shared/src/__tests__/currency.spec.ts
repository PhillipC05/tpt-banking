import {
  Currency,
  isSupportedCurrency,
  getCurrencyDecimalPlaces,
  getSupportedCurrencies,
} from '../types/currency';

describe('currency utilities', () => {
  describe('isSupportedCurrency()', () => {
    it('returns true for all enum members', () => {
      for (const code of Object.values(Currency)) {
        expect(isSupportedCurrency(code)).toBe(true);
      }
    });

    it('is case-insensitive', () => {
      expect(isSupportedCurrency('usd')).toBe(true);
      expect(isSupportedCurrency('Eur')).toBe(true);
      expect(isSupportedCurrency('GBP')).toBe(true);
    });

    it('returns false for unsupported codes', () => {
      expect(isSupportedCurrency('XXX')).toBe(false);
      expect(isSupportedCurrency('BTC')).toBe(false);
      expect(isSupportedCurrency('')).toBe(false);
    });

    it('returns false for non-string values', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isSupportedCurrency(null as any)).toBe(false);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(isSupportedCurrency(undefined as any)).toBe(false);
    });

    it('trims whitespace before checking', () => {
      expect(isSupportedCurrency(' USD ')).toBe(true);
    });
  });

  describe('getCurrencyDecimalPlaces()', () => {
    it('returns 0 for JPY', () => {
      expect(getCurrencyDecimalPlaces(Currency.JPY)).toBe(0);
    });

    it('returns 0 for KRW', () => {
      expect(getCurrencyDecimalPlaces(Currency.KRW)).toBe(0);
    });

    it('returns 3 for KWD', () => {
      expect(getCurrencyDecimalPlaces(Currency.KWD)).toBe(3);
    });

    it('returns 2 for USD', () => {
      expect(getCurrencyDecimalPlaces(Currency.USD)).toBe(2);
    });

    it('returns 2 for EUR', () => {
      expect(getCurrencyDecimalPlaces(Currency.EUR)).toBe(2);
    });

    it('returns 2 for GBP', () => {
      expect(getCurrencyDecimalPlaces(Currency.GBP)).toBe(2);
    });

    it('returns 2 for all other supported currencies', () => {
      const twoDp: Currency[] = [
        Currency.CHF, Currency.AUD, Currency.CAD, Currency.HKD, Currency.SGD,
        Currency.NZD, Currency.SEK, Currency.NOK, Currency.DKK, Currency.CNY,
        Currency.INR, Currency.MXN, Currency.BRL, Currency.ZAR, Currency.AED,
        Currency.SAR, Currency.QAR,
      ];
      for (const currency of twoDp) {
        expect(getCurrencyDecimalPlaces(currency)).toBe(2);
      }
    });
  });

  describe('getSupportedCurrencies()', () => {
    it('returns an array of all Currency enum values', () => {
      const result = getSupportedCurrencies();
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBe(Object.values(Currency).length);
    });

    it('includes major currencies', () => {
      const result = getSupportedCurrencies();
      expect(result).toContain(Currency.USD);
      expect(result).toContain(Currency.EUR);
      expect(result).toContain(Currency.GBP);
      expect(result).toContain(Currency.JPY);
    });

    it('contains no duplicates', () => {
      const result = getSupportedCurrencies();
      expect(new Set(result).size).toBe(result.length);
    });
  });
});
