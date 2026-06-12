import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import {
  OpenBankingClient, OpenBankingStandard, TppType, ClientStatus,
} from '@tpt/database';

export interface RegisterClientDto {
  clientName: string;
  clientDescription?: string;
  standard: OpenBankingStandard;
  tppTypes: TppType[];
  redirectUris: string[];
  allowedScopes: string[];
  grantTypes?: string[];
  logoUri?: string;
  tosUri?: string;
  policyUri?: string;
  jwksUri?: string;
  regulatoryRegistrationId?: string;
}

@Injectable()
export class ClientsService {
  constructor(
    @InjectRepository(OpenBankingClient)
    private readonly clientRepo: Repository<OpenBankingClient>,
  ) {}

  async register(dto: RegisterClientDto): Promise<{ client: OpenBankingClient; clientSecret: string }> {
    // Generate a random client secret (shown once — stored as hash)
    const rawSecret = uuidv4().replace(/-/g, '') + uuidv4().replace(/-/g, '');
    const secretHash = await argon2.hash(rawSecret, { type: argon2.argon2id });

    const client = this.clientRepo.create({
      clientName: dto.clientName,
      clientDescription: dto.clientDescription ?? null,
      standard: dto.standard,
      tppTypes: dto.tppTypes,
      status: ClientStatus.PENDING, // Requires manual activation
      redirectUris: dto.redirectUris,
      grantTypes: dto.grantTypes ?? ['authorization_code', 'refresh_token'],
      responseTypes: ['code'],
      allowedScopes: dto.allowedScopes,
      clientSecretHash: secretHash,
      regulatoryRegistrationId: dto.regulatoryRegistrationId ?? null,
      logoUri: dto.logoUri ?? null,
      tosUri: dto.tosUri ?? null,
      policyUri: dto.policyUri ?? null,
      jwksUri: dto.jwksUri ?? null,
    });

    const saved = await this.clientRepo.save(client);
    return { client: saved, clientSecret: rawSecret };
  }

  async activate(clientId: string): Promise<OpenBankingClient> {
    const client = await this.findByClientId(clientId);
    await this.clientRepo.update(client.id, { status: ClientStatus.ACTIVE });
    return this.findByClientId(clientId);
  }

  async suspend(clientId: string): Promise<OpenBankingClient> {
    const client = await this.findByClientId(clientId);
    await this.clientRepo.update(client.id, { status: ClientStatus.SUSPENDED });
    return this.findByClientId(clientId);
  }

  async findByClientId(clientId: string): Promise<OpenBankingClient> {
    const c = await this.clientRepo.findOne({ where: { clientId } });
    if (!c) throw new NotFoundException(`Client ${clientId} not found`);
    return c;
  }

  async findAll(): Promise<OpenBankingClient[]> {
    return this.clientRepo.find({ order: { createdAt: 'DESC' } });
  }

  // ── Dynamic Client Registration (RFC 7591) ────────────────────────────────

  async dynamicRegister(body: {
    software_statement?: string;
    redirect_uris:       string[];
    grant_types?:        string[];
    scope?:              string;
    client_name?:        string;
    logo_uri?:           string;
    policy_uri?:         string;
    tos_uri?:            string;
    jwks_uri?:           string;
    token_endpoint_auth_method?: string;
  }): Promise<{
    client_id:             string;
    client_secret:         string;
    client_id_issued_at:   number;
    client_secret_expires_at: number;
    redirect_uris:         string[];
    grant_types:           string[];
    scope:                 string;
    client_name:           string;
  }> {
    let ssaClaims: Record<string, unknown> = {};

    // Validate software statement assertion (SSA) if provided
    if (body.software_statement) {
      ssaClaims = await this.validateSoftwareStatement(body.software_statement);
    }

    // Merge SSA claims with body (body overrides SSA)
    const redirectUris: string[] = (ssaClaims['redirect_uris'] as string[] | undefined) ?? body.redirect_uris;
    const grantTypes:   string[] = body.grant_types ?? ['authorization_code', 'refresh_token'];
    const scope:        string   = body.scope ?? (ssaClaims['scope'] as string | undefined) ?? 'accounts';
    const clientName:   string   = body.client_name ?? (ssaClaims['org_name'] as string | undefined) ?? 'DCR Client';
    const jwksUri:      string | undefined = body.jwks_uri ?? (ssaClaims['jwks_uri'] as string | undefined);

    // All redirect URIs must be HTTPS
    for (const uri of redirectUris) {
      if (!uri.startsWith('https://')) {
        throw new BadRequestException(`redirect_uri must use HTTPS: ${uri}`);
      }
    }

    const { client, clientSecret } = await this.register({
      clientName,
      standard:    OpenBankingStandard.GENERIC_OAUTH2,
      tppTypes:    [TppType.AISP],
      redirectUris,
      allowedScopes: scope.split(' '),
      grantTypes,
      logoUri:     body.logo_uri,
      tosUri:      body.tos_uri,
      policyUri:   body.policy_uri,
      jwksUri,
    });

    // DCR activates immediately per RFC 7591 §3.2.1 (no PENDING step)
    await this.clientRepo.update(client.id, { status: ClientStatus.ACTIVE });

    return {
      client_id:                client.clientId,
      client_secret:            clientSecret,
      client_id_issued_at:      Math.floor(Date.now() / 1000),
      client_secret_expires_at: 0, // 0 = never expires per RFC 7591
      redirect_uris:            redirectUris,
      grant_types:              grantTypes,
      scope,
      client_name:              clientName,
    };
  }

  private async validateSoftwareStatement(ssa: string): Promise<Record<string, unknown>> {
    // Decode header to find kid/jwks_uri
    const [headerB64] = ssa.split('.');
    if (!headerB64) throw new BadRequestException('Invalid software statement format');

    let header: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf8'));
    } catch {
      throw new BadRequestException('Cannot decode software statement header');
    }

    const jwksUri = header['jku'] as string | undefined;
    if (!jwksUri) {
      // No JWKS URI — accept unverified SSA claims (dev/test mode)
      try {
        const [, payloadB64] = ssa.split('.');
        return JSON.parse(Buffer.from(payloadB64!, 'base64url').toString('utf8'));
      } catch {
        throw new BadRequestException('Cannot decode software statement payload');
      }
    }

    try {
      const jwks = createRemoteJWKSet(new URL(jwksUri));
      const { payload } = await jwtVerify(ssa, jwks);
      return payload as Record<string, unknown>;
    } catch (err: unknown) {
      throw new BadRequestException(
        `Software statement signature invalid: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }
}
