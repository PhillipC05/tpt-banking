import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  WireTransfer,
  WireType,
  WireStatus,
  AccountStatus,
  JournalType,
  LedgerEntryType,
} from '@tpt/database';
import { Money } from '@tpt/shared';
import { JournalService } from '../../ledger/journal.service';
import { AccountsService } from '../../accounts/accounts.service';
import { AuthService } from '../../auth/auth.service';

export interface InitiateWireDto {
  accountId: string;
  customerId: string;
  type: WireType;
  amount: number;
  currency: string;
  beneficiaryName: string;
  beneficiaryAccountNumber: string;
  beneficiaryRoutingNumber?: string;
  beneficiarySwiftBic?: string;
  beneficiaryBankName?: string;
  beneficiaryBankAddress?: string;
  beneficiaryAddress?: string;
  beneficiaryCountry?: string;
  iban?: string;
  intermediarySwiftBic?: string;
  intermediaryBankName?: string;
  paymentPurpose?: string;
  idempotencyKey: string;
  stepUpToken: string;
  userId: string;
}

const DOMESTIC_WIRE_FEE = 25;
const INTERNATIONAL_WIRE_FEE = 45;
const STEP_UP_REQUIRED_ABOVE = 10_000; // USD

@Injectable()
export class WireService {
  private readonly logger = new Logger(WireService.name);

  constructor(
    @InjectRepository(WireTransfer)
    private readonly wireRepo: Repository<WireTransfer>,
    private readonly journalService: JournalService,
    private readonly accountsService: AccountsService,
    private readonly authService: AuthService,
  ) {}

  async initiate(dto: InitiateWireDto): Promise<WireTransfer> {
    // Idempotency
    const existing = await this.wireRepo.findOne({ where: { idempotencyKey: dto.idempotencyKey } });
    if (existing) return existing;

    // Step-up auth required for all wires and amounts > $10K
    const stepUpValid = await this.authService.validateStepUpToken(dto.stepUpToken, dto.userId);
    if (!stepUpValid) {
      throw new ForbiddenException(
        'Wire transfers require step-up authentication. Please POST /auth/step-up first.',
      );
    }

    const account = await this.accountsService.findByIdOrThrow(dto.accountId);
    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${dto.accountId} is not active`);
    }

    const fee = dto.type === WireType.DOMESTIC ? DOMESTIC_WIRE_FEE : INTERNATIONAL_WIRE_FEE;
    const totalDebit = dto.amount + fee;

    // Check sufficient funds
    const balance = await this.accountsService.getBalance(dto.accountId);
    const available = parseFloat(balance.availableBalance);
    if (totalDebit > available) {
      throw new BadRequestException(
        `Insufficient available balance: required ${totalDebit} (${dto.amount} + ${fee} fee), available ${available}`,
      );
    }

    // Validate SWIFT/BIC for international
    if (dto.type === WireType.INTERNATIONAL && !dto.beneficiarySwiftBic) {
      throw new BadRequestException('SWIFT/BIC code is required for international wire transfers');
    }

    const wire = this.wireRepo.create({
      accountId: dto.accountId,
      customerId: dto.customerId,
      type: dto.type,
      status: WireStatus.PENDING_APPROVAL,
      amount: dto.amount.toFixed(6),
      currency: dto.currency,
      beneficiaryName: dto.beneficiaryName,
      beneficiaryAccountNumber: dto.beneficiaryAccountNumber,
      beneficiaryRoutingNumber: dto.beneficiaryRoutingNumber ?? null,
      beneficiarySwiftBic: dto.beneficiarySwiftBic ?? null,
      beneficiaryBankName: dto.beneficiaryBankName ?? null,
      beneficiaryBankAddress: dto.beneficiaryBankAddress ?? null,
      beneficiaryAddress: dto.beneficiaryAddress ?? null,
      beneficiaryCountry: dto.beneficiaryCountry ?? null,
      iban: dto.iban ?? null,
      intermediarySwiftBic: dto.intermediarySwiftBic ?? null,
      intermediaryBankName: dto.intermediaryBankName ?? null,
      paymentPurpose: dto.paymentPurpose ?? null,
      wireFee: fee.toFixed(6),
      idempotencyKey: dto.idempotencyKey,
    });

    const saved = await this.wireRepo.save(wire);
    this.logger.log(`Wire transfer ${saved.wireReference} initiated for ${dto.amount} ${dto.currency}`);
    return saved;
  }

  async approve(wireId: string, approverUserId: string): Promise<WireTransfer> {
    const wire = await this.findByIdOrThrow(wireId);
    if (wire.status !== WireStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Wire ${wireId} is not pending approval`);
    }

    // Place hold on account for amount + fee
    const totalHold = Money.fromDecimalString(wire.amount, wire.currency)
      .add(Money.fromDecimalString(wire.wireFee, wire.currency));

    await this.accountsService.placeHold(wire.accountId, totalHold.toDecimalString(), wire.currency);

    await this.wireRepo.update(wireId, {
      status: WireStatus.APPROVED,
      approvedByUserId: approverUserId,
      approvedAt: new Date(),
    });

    return this.findByIdOrThrow(wireId);
  }

  async submit(wireId: string): Promise<WireTransfer> {
    const wire = await this.findByIdOrThrow(wireId);
    if (wire.status !== WireStatus.APPROVED) {
      throw new BadRequestException(`Wire ${wireId} must be APPROVED before submission`);
    }

    // Post journal: debit customer account for amount + fee
    const totalAmount = Money.fromDecimalString(wire.amount, wire.currency)
      .add(Money.fromDecimalString(wire.wireFee, wire.currency));

    const journal = await this.journalService.postJournal({
      description: `Wire transfer — ${wire.wireReference} to ${wire.beneficiaryName}`,
      type: JournalType.WITHDRAWAL,
      reference: wire.wireReference,
      idempotencyKey: `wire:submit:${wire.idempotencyKey}`,
      entries: [
        {
          accountId: wire.accountId,
          type: LedgerEntryType.DEBIT,
          amount: totalAmount.toDecimalString(),
          currency: wire.currency,
          description: `Wire to ${wire.beneficiaryName} via ${wire.type === WireType.DOMESTIC ? 'Fedwire' : 'SWIFT'}`,
        },
      ],
    });

    // Release hold
    await this.accountsService.releaseHold(wire.accountId, totalAmount.toDecimalString(), wire.currency);

    await this.wireRepo.update(wireId, {
      status: WireStatus.PROCESSING,
      journalId: journal.id,
      submittedAt: new Date(),
    });

    this.logger.log(`Wire ${wire.wireReference} submitted for processing`);
    return this.findByIdOrThrow(wireId);
  }

  async complete(wireId: string): Promise<WireTransfer> {
    const wire = await this.findByIdOrThrow(wireId);
    await this.wireRepo.update(wireId, {
      status: WireStatus.COMPLETED,
      completedAt: new Date(),
    });
    return this.findByIdOrThrow(wireId);
  }

  async findById(id: string): Promise<WireTransfer | null> {
    return this.wireRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<WireTransfer> {
    const wire = await this.findById(id);
    if (!wire) throw new NotFoundException(`Wire transfer ${id} not found`);
    return wire;
  }

  async findByAccount(accountId: string): Promise<WireTransfer[]> {
    return this.wireRepo.find({ where: { accountId }, order: { createdAt: 'DESC' } });
  }
}
