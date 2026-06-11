import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { readFileSync } from 'fs';
import { JwtPayload } from '../types/jwt-payload';

/**
 * Passport strategy for RS256-signed JWT access tokens.
 *
 * Validates:
 * 1. Token signature using the RSA public key
 * 2. Token expiry (passport-jwt handles this automatically)
 *
 * The public key is read from the path specified by JWT_PUBLIC_KEY_PATH env var.
 * In production this path should be injected via a mounted secret, not baked in.
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor() {
    const publicKeyPath = process.env['JWT_PUBLIC_KEY_PATH'];
    if (!publicKeyPath) {
      throw new Error('JWT_PUBLIC_KEY_PATH environment variable is not set');
    }

    let publicKey: string;
    try {
      publicKey = readFileSync(publicKeyPath, 'utf8');
    } catch {
      throw new Error(
        `Failed to read JWT public key from ${publicKeyPath}. Generate with: openssl genrsa -out keys/private.pem 4096 && openssl rsa -in keys/private.pem -pubout -out keys/public.pem`,
      );
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: publicKey,
      algorithms: ['RS256'],
    });
  }

  /**
   * Called after Passport verifies the token signature and expiry.
   * Return value is attached to request.user.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (!payload.sub || !payload.email) {
      throw new UnauthorizedException('Invalid token payload');
    }
    return payload;
  }
}
