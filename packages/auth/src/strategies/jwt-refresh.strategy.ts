import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readFileSync } from 'fs';
import { Request } from 'express';
import { JwtRefreshPayload } from '../types/jwt-payload';

/**
 * Passport strategy for RS256-signed JWT refresh tokens.
 *
 * Refresh tokens are extracted from the `refresh_token` httpOnly cookie.
 * They carry a `tokenFamily` field used to detect refresh token reuse attacks —
 * if a rotated token's family matches a previously used one, all sessions are invalidated.
 */
@Injectable()
export class JwtRefreshStrategy extends PassportStrategy(Strategy, 'jwt-refresh') {
  constructor() {
    const publicKeyPath = process.env['JWT_PUBLIC_KEY_PATH'];
    if (!publicKeyPath) {
      throw new Error('JWT_PUBLIC_KEY_PATH environment variable is not set');
    }

    const publicKey = readFileSync(publicKeyPath, 'utf8');

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => {
          return (req?.cookies as Record<string, string> | undefined)?.['refresh_token'] ?? null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
      passReqToCallback: true,
    });
  }

  async validate(_req: Request, payload: JwtRefreshPayload): Promise<JwtRefreshPayload> {
    if (!payload.sub || !payload.sessionId || !payload.tokenFamily) {
      throw new UnauthorizedException('Invalid refresh token payload');
    }
    return payload;
  }
}
