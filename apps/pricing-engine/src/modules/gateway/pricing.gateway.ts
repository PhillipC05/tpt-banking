import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { MarketDataService } from '../market-data/market-data.service';
import { FxPricingService } from '../fx/fx-pricing.service';

interface SubscribeMessage_ {
  symbols?: string[];
  fxPairs?: string[];
  interval?: number; // ms between updates, default 1000
}

/**
 * Real-time pricing WebSocket gateway.
 * Clients subscribe to symbols or FX pairs and receive live price updates.
 *
 * Events emitted:
 *   'quote'     — equity/instrument price update
 *   'fx'        — FX spot rate update
 *   'error'     — subscription error
 *
 * Events received:
 *   'subscribe'   — subscribe to symbols/pairs
 *   'unsubscribe' — unsubscribe from symbols/pairs
 *   'ping'        — heartbeat check
 */
@WebSocketGateway({
  cors: { origin: '*' },
  namespace: '/pricing',
})
export class PricingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(PricingGateway.name);

  // Client subscriptions: clientId → { symbols, fxPairs, interval, timer }
  private readonly subscriptions = new Map<string, {
    symbols: Set<string>;
    fxPairs: Set<string>;
    timer: NodeJS.Timeout | null;
  }>();

  constructor(
    private readonly marketDataService: MarketDataService,
    private readonly fxService: FxPricingService,
  ) {}

  handleConnection(client: Socket): void {
    this.logger.log(`Client connected: ${client.id}`);
    this.subscriptions.set(client.id, { symbols: new Set(), fxPairs: new Set(), timer: null });
  }

  handleDisconnect(client: Socket): void {
    this.logger.log(`Client disconnected: ${client.id}`);
    this.clearSubscription(client.id);
  }

  @SubscribeMessage('subscribe')
  handleSubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: SubscribeMessage_,
  ): void {
    const sub = this.subscriptions.get(client.id);
    if (!sub) return;

    const symbols = data.symbols ?? [];
    const fxPairs = data.fxPairs ?? [];
    const interval = Math.max(data.interval ?? 1000, 500); // Min 500ms

    symbols.forEach((s) => sub.symbols.add(s.toUpperCase()));
    fxPairs.forEach((p) => sub.fxPairs.add(p.toUpperCase()));

    // Clear existing timer and restart
    if (sub.timer) clearInterval(sub.timer);

    sub.timer = setInterval(async () => {
      await this.pushUpdates(client, sub.symbols, sub.fxPairs);
    }, interval);

    // Send initial snapshot immediately
    this.pushUpdates(client, sub.symbols, sub.fxPairs).catch(() => {});

    this.logger.debug(`Client ${client.id} subscribed to ${symbols.length} symbols, ${fxPairs.length} FX pairs`);
    client.emit('subscribed', {
      symbols: Array.from(sub.symbols),
      fxPairs: Array.from(sub.fxPairs),
      interval,
    });
  }

  @SubscribeMessage('unsubscribe')
  handleUnsubscribe(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { symbols?: string[]; fxPairs?: string[] },
  ): void {
    const sub = this.subscriptions.get(client.id);
    if (!sub) return;

    data.symbols?.forEach((s) => sub.symbols.delete(s.toUpperCase()));
    data.fxPairs?.forEach((p) => sub.fxPairs.delete(p.toUpperCase()));

    if (sub.symbols.size === 0 && sub.fxPairs.size === 0) {
      if (sub.timer) clearInterval(sub.timer);
      sub.timer = null;
    }

    client.emit('unsubscribed', { symbols: data.symbols, fxPairs: data.fxPairs });
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket): void {
    client.emit('pong', { timestamp: new Date().toISOString() });
  }

  /**
   * Broadcast a price update to all subscribed clients.
   * Called by the market data feed when a new quote arrives.
   */
  broadcast(symbol: string, quote: unknown): void {
    this.server.to(`symbol:${symbol}`).emit('quote', quote);
  }

  private async pushUpdates(
    client: Socket,
    symbols: Set<string>,
    fxPairs: Set<string>,
  ): Promise<void> {
    try {
      if (symbols.size > 0) {
        const quotes = await this.marketDataService.getQuotes(Array.from(symbols));
        for (const quote of quotes) {
          client.emit('quote', quote);
        }
      }

      if (fxPairs.size > 0) {
        for (const pair of fxPairs) {
          const spot = this.fxService.getSpot(pair);
          if (spot) client.emit('fx', spot);
        }
      }
    } catch (err) {
      this.logger.error(`Error pushing updates to ${client.id}: ${err}`);
    }
  }

  private clearSubscription(clientId: string): void {
    const sub = this.subscriptions.get(clientId);
    if (sub?.timer) clearInterval(sub.timer);
    this.subscriptions.delete(clientId);
  }
}
