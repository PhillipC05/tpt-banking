import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  KycVerification,
  KycProvider,
  KycVerificationStatus,
  KycDocumentType,
} from '@tpt/database';
import { JumioService } from './providers/jumio.service';
import { OnfidoService } from './providers/onfido.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly activeProvider: KycProvider;

  constructor(
    @InjectRepository(KycVerification)
    private readonly kycRepo: Repository<KycVerification>,
    private readonly jumioService: JumioService,
    private readonly onfidoService: OnfidoService,
    private readonly config: ConfigService,
  ) {
    const providerEnv = this.config.get<string>('KYC_PROVIDER', 'JUMIO').toUpperCase();
    this.activeProvider = providerEnv === 'ONFIDO' ? KycProvider.ONFIDO : KycProvider.JUMIO;
    this.logger.log(`KYC provider: ${this.activeProvider}`);
  }

  /**
   * Initiates a KYC verification for a customer.
   * Returns a redirect URL (Jumio) or SDK token (Onfido) for the frontend.
   */
  async initiateVerification(params: {
    customerId: string;
    email: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
    nationality?: string;
    documentType?: KycDocumentType;
    documentCountry?: string;
  }): Promise<{ verificationId: string; redirectUrl?: string; sdkToken?: string; provider: string }> {
    // Check if there's already an active verification
    const existing = await this.kycRepo.findOne({
      where: [
        { customerId: params.customerId, status: KycVerificationStatus.INITIATED },
        { customerId: params.customerId, status: KycVerificationStatus.PENDING },
      ],
    });
    if (existing) {
      return {
        verificationId: existing.id,
        redirectUrl: existing.redirectUrl ?? undefined,
        provider: existing.provider,
      };
    }

    const verification = this.kycRepo.create({
      customerId: params.customerId,
      provider: this.activeProvider,
      status: KycVerificationStatus.INITIATED,
      documentType: params.documentType ?? null,
      documentCountry: params.documentCountry ?? null,
      expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000), // 7-day link expiry
    });
    const saved = await this.kycRepo.save(verification);

    const callbackBase = this.config.get<string>('APP_BASE_URL', 'http://localhost:3002');

    if (this.activeProvider === KycProvider.JUMIO) {
      const result = await this.jumioService.initiateVerification({
        customerId: params.customerId,
        email: params.email,
        firstName: params.firstName,
        lastName: params.lastName,
        callbackUrl: `${callbackBase}/v1/kyc/webhook/jumio`,
        successUrl: `${callbackBase}/v1/kyc/${saved.id}/success`,
        errorUrl: `${callbackBase}/v1/kyc/${saved.id}/error`,
      });
      await this.kycRepo.update(saved.id, {
        providerReference: result.transactionReference,
        redirectUrl: result.redirectUrl,
        status: KycVerificationStatus.PENDING,
      });
      return { verificationId: saved.id, redirectUrl: result.redirectUrl, provider: 'JUMIO' };
    } else {
      // Onfido: create applicant + generate SDK token
      const { applicantId } = await this.onfidoService.createApplicant({
        firstName: params.firstName,
        lastName: params.lastName,
        email: params.email,
        dateOfBirth: params.dateOfBirth ?? '1990-01-01',
        nationality: params.nationality ?? 'USA',
      });
      const sdkToken = await this.onfidoService.generateSdkToken(
        applicantId,
        `${callbackBase}/*`,
      );
      await this.kycRepo.update(saved.id, {
        providerReference: applicantId,
        status: KycVerificationStatus.PENDING,
      });
      return { verificationId: saved.id, sdkToken, provider: 'ONFIDO' };
    }
  }

  /**
   * Processes a Jumio webhook callback.
   */
  async processJumioWebhook(payload: Record<string, unknown>): Promise<void> {
    const txRef = payload['transactionReference'] as string;
    const verification = await this.kycRepo.findOne({ where: { providerReference: txRef } });
    if (!verification) {
      this.logger.warn(`No KYC verification found for Jumio ref ${txRef}`);
      return;
    }

    const result = await this.jumioService.getVerificationResult(txRef);
    const decision = this.jumioService.mapDecision(result.decision ?? '');

    await this.kycRepo.update(verification.id, {
      providerDecision: result.decision ?? null,
      rejectionReasons: result.rejectReasons as unknown as Record<string, unknown>[] ?? null,
      providerResponse: payload,
      status: KycVerificationStatus[decision],
      completedAt: new Date(),
    });

    this.logger.log(`KYC ${verification.id}: Jumio decision = ${decision}`);
  }

  /**
   * Processes an Onfido webhook callback.
   */
  async processOnfidoWebhook(payload: Record<string, unknown>): Promise<void> {
    const resourceId = (payload['resource_type'] === 'check')
      ? (payload['object'] as { id: string })?.id
      : null;
    if (!resourceId) return;

    const verification = await this.kycRepo.findOne({
      where: { status: KycVerificationStatus.PENDING, provider: KycProvider.ONFIDO },
    });
    if (!verification) return;

    const result = await this.onfidoService.getCheckResult(resourceId);
    const decision = this.onfidoService.mapResult(result.result);

    await this.kycRepo.update(verification.id, {
      providerDecision: result.result ?? null,
      providerResponse: payload,
      status: KycVerificationStatus[decision],
      completedAt: new Date(),
    });
  }

  /**
   * Manual review — compliance officer approves or declines.
   */
  async manualReview(
    verificationId: string,
    reviewerUserId: string,
    decision: 'APPROVED' | 'DECLINED',
    notes?: string,
  ): Promise<KycVerification> {
    const verification = await this.kycRepo.findOne({ where: { id: verificationId } });
    if (!verification) throw new NotFoundException(`KYC verification ${verificationId} not found`);

    await this.kycRepo.update(verificationId, {
      status: KycVerificationStatus[decision],
      reviewedByUserId: reviewerUserId,
      reviewedAt: new Date(),
      reviewerNotes: notes ?? null,
      completedAt: new Date(),
    });

    return this.kycRepo.findOneOrFail({ where: { id: verificationId } });
  }

  async findByCustomer(customerId: string): Promise<KycVerification[]> {
    return this.kycRepo.find({ where: { customerId }, order: { createdAt: 'DESC' } });
  }

  async findById(id: string): Promise<KycVerification> {
    const v = await this.kycRepo.findOne({ where: { id } });
    if (!v) throw new NotFoundException(`KYC verification ${id} not found`);
    return v;
  }
}
