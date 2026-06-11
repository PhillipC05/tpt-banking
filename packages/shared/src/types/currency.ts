/**
 * ISO 4217 currency codes supported by the TPT Banking platform.
 * All monetary operations must use currencies from this list.
 */
export enum Currency {
  // Major currencies
  USD = 'USD', // US Dollar
  EUR = 'EUR', // Euro
  GBP = 'GBP', // British Pound Sterling
  JPY = 'JPY', // Japanese Yen
  CHF = 'CHF', // Swiss Franc
  AUD = 'AUD', // Australian Dollar
  CAD = 'CAD', // Canadian Dollar
  HKD = 'HKD', // Hong Kong Dollar
  SGD = 'SGD', // Singapore Dollar

  // Additional major currencies
  NZD = 'NZD', // New Zealand Dollar
  SEK = 'SEK', // Swedish Krona
  NOK = 'NOK', // Norwegian Krone
  DKK = 'DKK', // Danish Krone
  CNY = 'CNY', // Chinese Yuan Renminbi
  INR = 'INR', // Indian Rupee
  MXN = 'MXN', // Mexican Peso
  BRL = 'BRL', // Brazilian Real
  ZAR = 'ZAR', // South African Rand
  KRW = 'KRW', // South Korean Won
  AED = 'AED', // UAE Dirham
  SAR = 'SAR', // Saudi Riyal
  QAR = 'QAR', // Qatari Riyal
  KWD = 'KWD', // Kuwaiti Dinar
}

/**
 * Set of all supported currency codes for O(1) lookup.
 */
const SUPPORTED_CURRENCIES = new Set<string>(Object.values(Currency));

/**
 * Checks whether a given currency code string is supported by the platform.
 * @param code - The currency code to check (case-insensitive)
 */
export function isSupportedCurrency(code: string): code is Currency {
  if (!code || typeof code !== 'string') {
    return false;
  }
  return SUPPORTED_CURRENCIES.has(code.trim().toUpperCase());
}

/**
 * Returns the number of decimal places conventionally used for a currency.
 * JPY and KRW use 0 decimal places; KWD uses 3; most others use 2.
 */
export function getCurrencyDecimalPlaces(currency: Currency): number {
  const zeroDpCurrencies: Currency[] = [Currency.JPY, Currency.KRW];
  const threeDpCurrencies: Currency[] = [Currency.KWD];

  if (zeroDpCurrencies.includes(currency)) return 0;
  if (threeDpCurrencies.includes(currency)) return 3;
  return 2;
}

/**
 * Returns an array of all supported currency codes.
 */
export function getSupportedCurrencies(): Currency[] {
  return Object.values(Currency);
}
