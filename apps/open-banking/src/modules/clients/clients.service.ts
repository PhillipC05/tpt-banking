import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { v4 as uuidv4 } from 'uuid';
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
}
