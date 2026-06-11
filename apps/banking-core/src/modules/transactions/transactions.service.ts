import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Transaction } from './entities/transaction.entity';
import { TransferSaga } from './saga/transfer.saga';
import { InitiateTransferDto } from './dto/initiate-transfer.dto';

@Injectable()
export class TransactionsService {
  constructor(
    @InjectRepository(Transaction)
    private readonly transactionsRepo: Repository<Transaction>,
    private readonly transferSaga: TransferSaga,
  ) {}

  async initiateTransfer(dto: InitiateTransferDto): Promise<Transaction> {
    return this.transferSaga.execute(dto);
  }

  async findById(id: string): Promise<Transaction> {
    const txn = await this.transactionsRepo.findOne({ where: { id } });
    if (!txn) throw new NotFoundException(`Transaction ${id} not found`);
    return txn;
  }

  async findByAccountId(
    accountId: string,
    params: { page?: number; limit?: number },
  ): Promise<{ transactions: Transaction[]; total: number; page: number; limit: number }> {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 50, 200);

    const [transactions, total] = await this.transactionsRepo.findAndCount({
      where: [
        { sourceAccountId: accountId },
        { destinationAccountId: accountId },
      ],
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { transactions, total, page, limit };
  }
}
