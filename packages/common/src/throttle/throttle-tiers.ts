import { Throttle as NestThrottle, SkipThrottle as NestSkipThrottle } from '@nestjs/throttler';

export { NestSkipThrottle as SkipThrottle };

/**
 * Pre-defined rate-limit tiers for the TPT Banking platform.
 *
 * Apply to controllers or individual route handlers using the @Throttle() decorator.
 *
 * Tiers (all measured per IP address):
 *   AUTH       — 5 requests / 60 s  — login, register, step-up endpoints
 *   STANDARD   — 120 requests / 60 s — normal authenticated API calls
 *   HIGH_FREQ  — 600 requests / 60 s — pricing, market data, WebSocket fallback
 *   ADMIN      — 30 requests / 60 s  — admin / compliance / SAR filing endpoints
 *   PUBLIC     — 20 requests / 60 s  — unauthenticated / public health / discovery endpoints
 */
export const ThrottleTiers = {
  AUTH: { default: { ttl: 60_000, limit: 5 } },
  STANDARD: { default: { ttl: 60_000, limit: 120 } },
  HIGH_FREQ: { default: { ttl: 60_000, limit: 600 } },
  ADMIN: { default: { ttl: 60_000, limit: 30 } },
  PUBLIC: { default: { ttl: 60_000, limit: 20 } },
} as const;

/**
 * Rate-limit decorator shorthand.
 *
 * Usage:
 *   @Throttle(ThrottleTiers.AUTH)
 *   @Post('/login')
 *   async login(...) {}
 *
 * Passes through to @nestjs/throttler's @Throttle decorator.
 */
export const Throttle = NestThrottle;
