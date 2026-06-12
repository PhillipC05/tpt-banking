import {
  BadRequestException, Injectable, Logger, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { OpenBankingClient, OpenBankingConsent, ConsentStatus, ConsentType, ClientStatus } from '@tpt/database';
import * as argon2 from 'argon2';

const AUTH_CODE_TTL_SECONDS = 600;       // 10 minutes
const ACCESS_TOKEN_TTL_SECONDS = 3600;   // 1 hour
const REFRESH_TOKEN_TTL_SECONDS = 604800; // 7 days
const TOKEN_PREFIX = 'ob:token:';
const REFRESH_PREFIX = 'ob:refresh:';

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  expires_in: number;
  refresh_token?: string;
  id_token?: string;
  scope: string;
  consent_id?: string;
}

export interface OidcUserInfo {
  sub:             string;
  email?:          string;
  name?:           string;
  email_verified?: boolean;
}

export interface TokenIntrospection {
  active: boolean;
  client_id?: string;
  sub?: string;
  scope?: string;
  exp?: number;
  consent_id?: string;
}

@Injectable()
export class OAuth2Service {
  private readonly logger = new Logger(OAuth2Service.name);

  constructor(
    @InjectRepository(OpenBankingClient)
    private readonly clientRepo: Repository<OpenBankingClient>,
    @InjectRepository(OpenBankingConsent)
    private readonly consentRepo: Repository<OpenBankingConsent>,
    private readonly jwtService: JwtService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  // ─── Authorization endpoint ───────────────────────────────────────────────

  /**
   * Generates an authorization URL for the PSU to consent and authenticate.
   * Validates client, redirect_uri, scope, PKCE code_challenge.
   */
  async buildAuthorizationUrl(params: {
    clientId: string;
    redirectUri: string;
    scope: string;
    state?: string;
    codeChallenge: string;
    codeChallengeMethod: 'S256' | 'plain';
    consentId?: string;
    nonce?: string;
  }): Promise<{ authorizationUrl: string; consentId: string }> {
    const client = await this.validateClient(params.clientId);

    if (!client.redirectUris.includes(params.redirectUri)) {
      throw new BadRequestException(`redirect_uri not registered for this client`);
    }

    const requestedScopes = params.scope.split(' ');
    const invalidScopes = requestedScopes.filter(
      (s) => !client.allowedScopes.includes(s),
    );
    if (invalidScopes.length > 0) {
      throw new BadRequestException(`Scopes not allowed: ${invalidScopes.join(', ')}`);
    }

    if (params.codeChallengeMethod !== 'S256') {
      throw new BadRequestException('Only S256 code_challenge_method is supported');
    }

    // Create or retrieve consent
    let consent: OpenBankingConsent;
    if (params.consentId) {
      const existing = await this.consentRepo.findOne({ where: { consentId: params.consentId } });
      if (!existing || existing.clientId !== params.clientId) {
        throw new BadRequestException('consent_id not found or belongs to different client');
      }
      consent = existing;
    } else {
      consent = this.consentRepo.create({
        clientId: params.clientId,
        type: requestedScopes.includes('payments')
          ? ConsentType.DOMESTIC_PAYMENT
          : ConsentType.ACCOUNT_ACCESS,
        status: ConsentStatus.AWAITING_AUTHORISATION,
        permissions: requestedScopes,
        codeChallenge: params.codeChallenge,
        codeChallengeMethod: params.codeChallengeMethod,
        state: params.state ?? null,
        redirectUri: params.redirectUri,
      });
      consent = await this.consentRepo.save(consent);
    }

    // In production: redirect PSU to authentication UI where they log in + select accounts
    const baseUrl = process.env['OPEN_BANKING_PORTAL_URL'] ?? 'http://localhost:3003';
    const authorizationUrl = `${baseUrl}/auth/consent?consent_id=${consent.consentId}&client_id=${params.clientId}&state=${params.state ?? ''}`;

    return { authorizationUrl, consentId: consent.consentId };
  }

  /**
   * Called after PSU authenticates and approves the consent.
   * Issues a short-lived authorization code.
   */
  async authorizeConsent(
    consentId: string,
    customerId: string,
    approvedAccountIds: string[],
  ): Promise<{ code: string; state: string | null; redirectUri: string }> {
    const consent = await this.consentRepo.findOne({ where: { consentId } });
    if (!consent) throw new NotFoundException(`Consent ${consentId} not found`);
    if (consent.status !== ConsentStatus.AWAITING_AUTHORISATION) {
      throw new BadRequestException(`Consent is in ${consent.status} state`);
    }

    const authCode = uuidv4().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + AUTH_CODE_TTL_SECONDS * 1000);

    await this.consentRepo.update(consent.id, {
      status: ConsentStatus.AUTHORISED,
      customerId,
      authorisedAccountIds: approvedAccountIds,
      authorizationCode: authCode,
      authorizationCodeExpiresAt: expiresAt,
      authorisedAt: new Date(),
      expiresAt: new Date(Date.now() + 90 * 24 * 3600 * 1000), // 90-day consent
    });

    return {
      code: authCode,
      state: consent.state,
      redirectUri: consent.redirectUri!,
    };
  }

  // ─── Token endpoint ───────────────────────────────────────────────────────

  async exchangeCodeForTokens(params: {
    clientId: string;
    clientSecret?: string;
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<TokenResponse> {
    const client = await this.validateClient(params.clientId, params.clientSecret);

    const consent = await this.consentRepo.findOne({
      where: { authorizationCode: params.code, clientId: params.clientId },
    });
    if (!consent) throw new UnauthorizedException('Invalid authorization code');
    if (consent.authorizationCodeExpiresAt && consent.authorizationCodeExpiresAt < new Date()) {
      throw new UnauthorizedException('Authorization code expired');
    }

    // Validate PKCE: SHA-256(code_verifier) == code_challenge
    this.validatePkce(params.codeVerifier, consent.codeChallenge!, consent.codeChallengeMethod!);

    if (consent.redirectUri !== params.redirectUri) {
      throw new UnauthorizedException('redirect_uri mismatch');
    }

    // Invalidate the auth code (one-time use)
    await this.consentRepo.update(consent.id, {
      authorizationCode: null,
      authorizationCodeExpiresAt: null,
    });

    return this.issueTokenPair(client, consent);
  }

  async refreshAccessToken(params: {
    clientId: string;
    clientSecret?: string;
    refreshToken: string;
  }): Promise<TokenResponse> {
    const client = await this.validateClient(params.clientId, params.clientSecret);
    const stored = await this.redis.get(`${REFRESH_PREFIX}${params.refreshToken}`);

    if (!stored) throw new UnauthorizedException('Invalid or expired refresh token');

    const { consentId, customerId } = JSON.parse(stored) as { consentId: string; customerId: string };
    const consent = await this.consentRepo.findOne({ where: { consentId } });
    if (!consent || consent.status !== ConsentStatus.AUTHORISED) {
      throw new UnauthorizedException('Consent is no longer active');
    }

    // Invalidate old refresh token (rotation)
    await this.redis.del(`${REFRESH_PREFIX}${params.refreshToken}`);

    return this.issueTokenPair(client, consent);
  }

  async introspectToken(token: string, clientId: string): Promise<TokenIntrospection> {
    const stored = await this.redis.get(`${TOKEN_PREFIX}${token}`);
    if (!stored) return { active: false };

    const payload = JSON.parse(stored) as {
      sub: string;
      client_id: string;
      scope: string;
      exp: number;
      consent_id: string;
    };

    if (payload.exp < Math.floor(Date.now() / 1000)) return { active: false };
    // Allow wildcard '*' for internal service calls (e.g. UserInfo endpoint)
    if (clientId !== '*' && payload.client_id !== clientId) return { active: false };

    return {
      active: true,
      client_id: payload.client_id,
      sub: payload.sub,
      scope: payload.scope,
      exp: payload.exp,
      consent_id: payload.consent_id,
    };
  }

  async getUserInfo(authHeader: string): Promise<OidcUserInfo> {
    const token = authHeader?.replace('Bearer ', '');
    if (!token) throw new UnauthorizedException('Missing Bearer token');

    const stored = await this.redis.get(`${TOKEN_PREFIX}${token}`);
    if (!stored) throw new UnauthorizedException('Invalid or expired token');

    const payload = JSON.parse(stored) as {
      sub: string;
      scope: string;
      exp: number;
      email?: string;
      name?: string;
    };

    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }
    if (!payload.scope.includes('openid')) {
      throw new UnauthorizedException('Token does not have openid scope');
    }

    return {
      sub:             payload.sub,
      email:           payload.email,
      name:            payload.name,
      email_verified:  true,
    };
  }

  async revokeToken(token: string): Promise<void> {
    await Promise.all([
      this.redis.del(`${TOKEN_PREFIX}${token}`),
      this.redis.del(`${REFRESH_PREFIX}${token}`),
    ]);
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  private async validateClient(clientId: string, clientSecret?: string): Promise<OpenBankingClient> {
    const client = await this.clientRepo.findOne({ where: { clientId } });
    if (!client || client.status !== ClientStatus.ACTIVE) {
      throw new UnauthorizedException('Invalid client_id');
    }

    if (clientSecret && client.clientSecretHash) {
      const valid = await argon2.verify(client.clientSecretHash, clientSecret);
      if (!valid) throw new UnauthorizedException('Invalid client credentials');
    }

    return client;
  }

  private async issueTokenPair(
    client: OpenBankingClient,
    consent: OpenBankingConsent,
  ): Promise<TokenResponse> {
    const tokenId = uuidv4();
    const refreshTokenId = uuidv4();
    const now = Math.floor(Date.now() / 1000);
    const exp = now + client.accessTokenTtl;

    const scopes      = consent.permissions.join(' ');
    const includeOidc = consent.permissions.includes('openid');
    const iss         = process.env['OPEN_BANKING_BASE_URL'] ?? 'http://localhost:3003';

    const tokenPayload = {
      sub:        consent.customerId ?? '',
      client_id:  client.clientId,
      scope:      scopes,
      consent_id: consent.consentId,
      jti:        tokenId,
      iat:        now,
      exp,
      // Store user claims in Redis so UserInfo endpoint doesn't need a cross-service call
      email: consent.riskData?.['email'] as string | undefined,
      name:  consent.riskData?.['name']  as string | undefined,
    };

    // Store token payload in Redis (fast revocation, no DB lookup)
    await this.redis.setex(
      `${TOKEN_PREFIX}${tokenId}`,
      client.accessTokenTtl,
      JSON.stringify(tokenPayload),
    );

    await this.redis.setex(
      `${REFRESH_PREFIX}${refreshTokenId}`,
      client.refreshTokenTtl,
      JSON.stringify({ consentId: consent.consentId, customerId: consent.customerId }),
    );

    // Issue id_token (signed JWT) when openid scope is requested
    let idToken: string | undefined;
    if (includeOidc) {
      idToken = this.jwtService.sign(
        {
          sub:            consent.customerId ?? '',
          email:          tokenPayload.email,
          name:           tokenPayload.name,
          iss,
          aud:            client.clientId,
          nonce:          consent.riskData?.['nonce'] as string | undefined,
          at_hash:        tokenId.slice(0, 16),
        },
        { expiresIn: client.accessTokenTtl },
      );
    }

    return {
      access_token:  tokenId, // opaque token — payload in Redis
      token_type:    'Bearer',
      expires_in:    client.accessTokenTtl,
      refresh_token: refreshTokenId,
      ...(idToken ? { id_token: idToken } : {}),
      scope:         scopes,
      consent_id:    consent.consentId,
    };
  }

  private validatePkce(codeVerifier: string, codeChallenge: string, method: string): void {
    if (method === 'S256') {
      const computed = createHash('sha256')
        .update(codeVerifier)
        .digest('base64url');
      if (computed !== codeChallenge) {
        throw new UnauthorizedException('PKCE code_verifier does not match code_challenge');
      }
    }
  }
}
