import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { readFileSync } from 'fs';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';
import { JwtPayload, JwtRefreshPayload } from '@tpt/auth';

const STEP_UP_TTL = 300; // 5 minutes
const REFRESH_TTL_SECONDS = 7 * 24 * 3600; // 7 days
const BLOCKLIST_PREFIX = 'token:blocked:';
const STEP_UP_PREFIX = 'step-up:';

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

@Injectable()
export class AuthService {
  private readonly privateKey: string;

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    const keyPath = this.config.get<string>('JWT_PRIVATE_KEY_PATH');
    if (!keyPath) throw new Error('JWT_PRIVATE_KEY_PATH not set');
    this.privateKey = readFileSync(keyPath, 'utf8');
  }

  async login(email: string, password: string, totpCode?: string): Promise<TokenPair> {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');

    if (user.isLocked) {
      throw new UnauthorizedException('Account is temporarily locked due to too many failed attempts');
    }

    const passwordValid = await this.usersService.verifyPassword(user, password);
    if (!passwordValid) {
      await this.usersService.recordFailedLogin(user.id);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.mfaEnabled) {
      if (!totpCode) throw new UnauthorizedException('MFA code required');
      const valid = this.verifyTotp(user.mfaSecret!, totpCode);
      if (!valid) throw new UnauthorizedException('Invalid MFA code');
    }

    await this.usersService.recordSuccessfulLogin(user.id);
    return this.issueTokenPair(user);
  }

  async logout(userId: string, accessToken: string): Promise<void> {
    const payload = this.jwtService.decode(accessToken) as JwtPayload | null;
    if (!payload?.exp) return;

    const ttl = payload.exp - Math.floor(Date.now() / 1000);
    if (ttl > 0) {
      await this.redis.setex(`${BLOCKLIST_PREFIX}${accessToken}`, ttl, '1');
    }
  }

  async refreshTokens(refreshToken: string): Promise<TokenPair> {
    let payload: JwtRefreshPayload;
    try {
      payload = this.jwtService.verify<JwtRefreshPayload>(refreshToken, {
        secret: this.privateKey,
        algorithms: ['RS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const user = await this.usersService.findById(payload.sub);
    if (!user) throw new UnauthorizedException('User not found');

    // Invalidate old refresh token family to prevent reuse
    await this.redis.del(`refresh:${payload.tokenFamily}`);

    return this.issueTokenPair(user);
  }

  async register(dto: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
  }): Promise<{ userId: string; email: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new BadRequestException('An account with this email already exists');

    const user = await this.usersService.create(dto);
    return { userId: user.id, email: user.email };
  }

  async setupMfa(userId: string): Promise<{ secret: string; qrCodeDataUrl: string; otpauthUrl: string }> {
    const user = await this.usersService.findByIdOrThrow(userId);
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled');

    const totp = new OTPAuth.TOTP({
      issuer: 'TPT Banking',
      label: user.email,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });

    const secret = totp.secret.base32;
    await this.usersService.setMfaSecret(userId, secret);

    const otpauthUrl = totp.toString();
    const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl);

    return { secret, qrCodeDataUrl, otpauthUrl };
  }

  async verifyAndEnableMfa(userId: string, code: string): Promise<void> {
    const user = await this.usersService.findByIdOrThrow(userId);
    if (!user.mfaSecret) throw new BadRequestException('MFA setup not initiated. Call /auth/mfa/setup first');
    if (user.mfaEnabled) throw new BadRequestException('MFA is already enabled');

    const valid = this.verifyTotp(user.mfaSecret, code);
    if (!valid) throw new UnauthorizedException('Invalid TOTP code');

    await this.usersService.enableMfa(userId);
  }

  async stepUp(userId: string, password: string): Promise<{ stepUpToken: string; expiresIn: number }> {
    const user = await this.usersService.findByIdOrThrow(userId);
    const valid = await this.usersService.verifyPassword(user, password);
    if (!valid) throw new UnauthorizedException('Invalid password');

    const stepUpToken = uuidv4();
    await this.redis.setex(`${STEP_UP_PREFIX}${stepUpToken}`, STEP_UP_TTL, userId);

    return { stepUpToken, expiresIn: STEP_UP_TTL };
  }

  async validateStepUpToken(token: string, userId: string): Promise<boolean> {
    const storedUserId = await this.redis.get(`${STEP_UP_PREFIX}${token}`);
    return storedUserId === userId;
  }

  async isTokenBlocked(token: string): Promise<boolean> {
    const result = await this.redis.get(`${BLOCKLIST_PREFIX}${token}`);
    return result !== null;
  }

  private async issueTokenPair(user: User): Promise<TokenPair> {
    const sessionId = uuidv4();
    const tokenFamily = uuidv4();

    const accessPayload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles: user.roles,
      sessionId,
    };

    const refreshPayload: JwtRefreshPayload = {
      sub: user.id,
      sessionId,
      tokenFamily,
    };

    const expiresIn = 15 * 60; // 15 minutes in seconds

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(accessPayload, {
        privateKey: this.privateKey,
        algorithm: 'RS256',
        expiresIn,
      }),
      this.jwtService.signAsync(refreshPayload, {
        privateKey: this.privateKey,
        algorithm: 'RS256',
        expiresIn: REFRESH_TTL_SECONDS,
      }),
    ]);

    return { accessToken, refreshToken, expiresIn };
  }

  private verifyTotp(secret: string, code: string): boolean {
    const totp = new OTPAuth.TOTP({
      secret: OTPAuth.Secret.fromBase32(secret),
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    });
    const delta = totp.validate({ token: code, window: 1 });
    return delta !== null;
  }
}
