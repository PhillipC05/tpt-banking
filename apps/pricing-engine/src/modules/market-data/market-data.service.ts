import { Injectable, Logger } from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

export interface MarketQuote {
  instrumentId: string;
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  last: number;
  volume: number;
  change: number;
  changePct: number;
  high: number;
  low: number;
  open: number;
  timestamp: string;
  source: string;
}

const QUOTE_TTL_SECONDS = 300; // 5 minutes
const QUOTE_KEY_PREFIX = 'market:quote:';

/**
 * Market data service.
 * Caches real-time market quotes in Redis.
 * In production: receives quotes from Bloomberg/Refinitiv via market data feed adapter.
 * Provides simulated data in development mode.
 */
@Injectable()
export class MarketDataService {
  private readonly logger = new Logger(MarketDataService.name);

  // Simulated baseline prices (dev/sandbox)
  private readonly basePrices = new Map<string, number>([
    ['AAPL', 189.50],  ['MSFT', 415.20],  ['GOOGL', 175.80],
    ['AMZN', 195.60],  ['META', 505.30],  ['TSLA', 175.40],
    ['JPM', 198.20],   ['BAC', 37.80],    ['GS', 462.10],
    ['MS', 90.50],     ['BRK.B', 368.40], ['V', 272.50],
    ['MA', 471.80],    ['JNJ', 152.30],   ['UNH', 548.70],
    ['XOM', 118.20],   ['CVX', 163.40],   ['NVDA', 878.40],
    ['AMD', 174.20],   ['INTC', 35.60],
    // Fixed income ETFs (as proxies)
    ['TLT', 96.20],    ['IEF', 96.50],    ['SHY', 82.30],
    // Commodity ETFs
    ['GLD', 199.40],   ['USO', 73.60],    ['SLV', 22.80],
  ]);

  constructor(@InjectRedis() private readonly redis: Redis) {}

  async getQuote(symbol: string): Promise<MarketQuote | null> {
    const cached = await this.redis.get(`${QUOTE_KEY_PREFIX}${symbol.toUpperCase()}`);
    if (cached) return JSON.parse(cached) as MarketQuote;

    // Generate simulated quote (dev mode)
    return this.generateSimulatedQuote(symbol.toUpperCase());
  }

  async getQuotes(symbols: string[]): Promise<MarketQuote[]> {
    const results = await Promise.all(symbols.map((s) => this.getQuote(s)));
    return results.filter((q): q is MarketQuote => q !== null);
  }

  async updateQuote(quote: Omit<MarketQuote, 'timestamp'>): Promise<void> {
    const full: MarketQuote = { ...quote, timestamp: new Date().toISOString() };
    await this.redis.setex(
      `${QUOTE_KEY_PREFIX}${quote.symbol.toUpperCase()}`,
      QUOTE_TTL_SECONDS,
      JSON.stringify(full),
    );
    this.logger.debug(`Quote updated: ${quote.symbol} mid=${quote.mid}`);
  }

  async updateInstrumentPrice(instrumentId: string, price: number, symbol: string): Promise<void> {
    const quote = await this.getQuote(symbol);
    if (quote) {
      await this.updateQuote({ ...quote, last: price, mid: price });
    }
    // Also store by instrumentId for direct lookup
    await this.redis.setex(
      `${QUOTE_KEY_PREFIX}id:${instrumentId}`,
      QUOTE_TTL_SECONDS,
      JSON.stringify({ price, symbol, timestamp: new Date().toISOString() }),
    );
  }

  async getLastPrice(instrumentId: string): Promise<number | null> {
    const cached = await this.redis.get(`${QUOTE_KEY_PREFIX}id:${instrumentId}`);
    if (!cached) return null;
    const data = JSON.parse(cached) as { price: number };
    return data.price;
  }

  /**
   * Simulates a market quote with realistic bid-ask spread and slight randomization.
   * Only used in development — replaced by real feed adapter in production.
   */
  private generateSimulatedQuote(symbol: string): MarketQuote | null {
    const basePrice = this.basePrices.get(symbol);
    if (!basePrice) return null;

    // Add small random noise (±0.5%)
    const noise = 1 + (Math.random() - 0.5) * 0.01;
    const mid = basePrice * noise;
    const spreadPct = 0.001; // 10bps spread
    const bid = mid * (1 - spreadPct / 2);
    const ask = mid * (1 + spreadPct / 2);
    const open = basePrice;
    const change = mid - open;

    return {
      instrumentId: `sim-${symbol}`,
      symbol,
      bid,
      ask,
      mid,
      last: mid,
      volume: Math.floor(Math.random() * 10_000_000),
      change,
      changePct: (change / open) * 100,
      high: mid * 1.005,
      low: mid * 0.995,
      open,
      timestamp: new Date().toISOString(),
      source: 'SIMULATED',
    };
  }
}
