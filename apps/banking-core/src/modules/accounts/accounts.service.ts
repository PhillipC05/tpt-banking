import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Account, AccountStatus, AccountType } from '@tpt/database';
import { Money } from '@tpt/shared';
import { CreateAccountDto } from './dto/create-account.dto';
import { CustomersService } from '../customers/customers.service';

interface BalanceInfo {
  balance: string;
  availableBalance: string;
  holdAmount: string;
  currency: string;
}

@Injectable()
export class AccountsService {
  constructor(
    @InjectRepository(Account)
    private readonly accountsRepo: Repository<Account>,
    private readonly customersService: CustomersService,
  ) {}

  async create(dto: CreateAccountDto): Promise<Account> {
    // Verify customer exists and is active
    const customer = await this.customersService.findByIdOrThrow(dto.customerId);
    if (customer.status !== 'ACTIVE') {
      throw new BadRequestException(
        `Customer ${dto.customerId} is not active (status: ${customer.status}). KYC approval required.`,
      );
    }

    const account = this.accountsRepo.create({
      customerId: dto.customerId,
      type: dto.type,
      currency: (dto.currency ?? 'USD').toUpperCase(),
      status: AccountStatus.ACTIVE,
    });

    return this.accountsRepo.save(account);
  }

  async findById(id: string): Promise<Account | null> {
    return this.accountsRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<Account> {
    const account = await this.findById(id);
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async findByAccountNumber(accountNumber: string): Promise<Account | null> {
    return this.accountsRepo.findOne({ where: { accountNumber } });
  }

  async findByCustomer(customerId: string): Promise<Account[]> {
    return this.accountsRepo.find({ where: { customerId } });
  }

  async getBalance(id: string): Promise<BalanceInfo> {
    const account = await this.findByIdOrThrow(id);
    return {
      balance: account.balance,
      availableBalance: account.availableBalance,
      holdAmount: account.holdAmount,
      currency: account.currency,
    };
  }

  async updateStatus(id: string, status: AccountStatus, reason?: string): Promise<Account> {
    const account = await this.findByIdOrThrow(id);

    const validTransitions: Record<AccountStatus, AccountStatus[]> = {
      [AccountStatus.PENDING]: [AccountStatus.ACTIVE, AccountStatus.CLOSED],
      [AccountStatus.ACTIVE]: [AccountStatus.DORMANT, AccountStatus.FROZEN, AccountStatus.CLOSED],
      [AccountStatus.DORMANT]: [AccountStatus.ACTIVE, AccountStatus.CLOSED],
      [AccountStatus.FROZEN]: [AccountStatus.ACTIVE, AccountStatus.CLOSED],
      [AccountStatus.CLOSED]: [],
    };

    if (!validTransitions[account.status].includes(status)) {
      throw new BadRequestException(
        `Cannot transition account from ${account.status} to ${status}`,
      );
    }

    account.status = status;
    if (status === AccountStatus.CLOSED) {
      account.closedAt = new Date();
    }

    return this.accountsRepo.save(account);
  }

  async placeHold(id: string, amount: string, currency: string): Promise<Account> {
    const account = await this.findByIdOrThrow(id);

    if (account.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException(`Account ${id} is not active`);
    }

    const holdMoney = Money.fromDecimalString(amount, currency);
    const currentAvailable = Money.fromDecimalString(account.availableBalance, account.currency);

    if (holdMoney.greaterThan(currentAvailable)) {
      throw new BadRequestException(
        `Insufficient available balance to place hold of ${amount} ${currency}`,
      );
    }

    const currentHold = Money.fromDecimalString(account.holdAmount, account.currency);
    const newHold = currentHold.add(holdMoney);

    await this.accountsRepo.update(id, {
      holdAmount: newHold.toDecimalString(),
    });

    return this.findByIdOrThrow(id);
  }

  async releaseHold(id: string, amount: string, currency: string): Promise<Account> {
    const account = await this.findByIdOrThrow(id);

    const releaseMoney = Money.fromDecimalString(amount, currency);
    const currentHold = Money.fromDecimalString(account.holdAmount, account.currency);

    const newHold = currentHold.subtract(releaseMoney);
    if (newHold.isNegative()) {
      throw new BadRequestException('Release amount exceeds current hold amount');
    }

    await this.accountsRepo.update(id, {
      holdAmount: newHold.toDecimalString(),
    });

    return this.findByIdOrThrow(id);
  }
}
