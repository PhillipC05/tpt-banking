import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OpenBankingConsent, ConsentStatus, ConsentType } from '@tpt/database';

@Injectable()
export class ConsentService {
  constructor(
    @InjectRepository(OpenBankingConsent)
    private readonly consentRepo: Repository<OpenBankingConsent>,
  ) {}

  async findById(consentId: string): Promise<OpenBankingConsent> {
    const consent = await this.consentRepo.findOne({ where: { consentId } });
    if (!consent) throw new NotFoundException(`Consent ${consentId} not found`);
    return consent;
  }

  async findByCustomer(customerId: string): Promise<OpenBankingConsent[]> {
    return this.consentRepo.find({
      where: { customerId, status: ConsentStatus.AUTHORISED },
      order: { createdAt: 'DESC' },
    });
  }

  async revoke(consentId: string, revokedBy: string): Promise<OpenBankingConsent> {
    const consent = await this.findById(consentId);
    if (consent.status === ConsentStatus.REVOKED) {
      throw new BadRequestException('Consent is already revoked');
    }

    await this.consentRepo.update(consent.id, {
      status: ConsentStatus.REVOKED,
      revokedAt: new Date(),
    });

    return this.findById(consentId);
  }

  /** Validate that a token has the required scope for an operation */
  async validateScope(consentId: string, requiredScope: string): Promise<boolean> {
    const consent = await this.findById(consentId);
    if (consent.status !== ConsentStatus.AUTHORISED) return false;
    if (consent.expiresAt && consent.expiresAt < new Date()) return false;
    return consent.permissions.includes(requiredScope);
  }
}
