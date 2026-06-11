import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Customer, CustomerStatus, CustomerTier, KycStatus } from '@tpt/database';
import { CreateCustomerDto } from './dto/create-customer.dto';

@Injectable()
export class CustomersService {
  constructor(
    @InjectRepository(Customer)
    private readonly customersRepo: Repository<Customer>,
  ) {}

  async create(dto: CreateCustomerDto): Promise<Customer> {
    const existing = await this.customersRepo.findOne({ where: { email: dto.email.toLowerCase() } });
    if (existing) throw new ConflictException(`A customer with email ${dto.email} already exists`);

    const customer = this.customersRepo.create({
      email: dto.email.toLowerCase(),
      firstName: dto.firstName,
      lastName: dto.lastName,
      middleName: dto.middleName ?? null,
      dateOfBirth: new Date(dto.dateOfBirth),
      phone: dto.phone ?? null,
      nationality: dto.nationality.toUpperCase(),
      taxId: dto.taxId ?? null,
      tier: dto.tier ?? CustomerTier.RETAIL,
      status: CustomerStatus.PENDING_KYC,
      kycStatus: KycStatus.NOT_STARTED,
    });

    return this.customersRepo.save(customer);
  }

  async findById(id: string): Promise<Customer | null> {
    return this.customersRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<Customer> {
    const customer = await this.findById(id);
    if (!customer) throw new NotFoundException(`Customer ${id} not found`);
    return customer;
  }

  async findByCifNumber(cifNumber: string): Promise<Customer | null> {
    return this.customersRepo.findOne({ where: { customerNumber: cifNumber } });
  }

  async findByEmail(email: string): Promise<Customer | null> {
    return this.customersRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async update(
    id: string,
    updates: Partial<Pick<Customer, 'phone' | 'email' | 'middleName'>>,
  ): Promise<Customer> {
    const customer = await this.findByIdOrThrow(id);
    Object.assign(customer, updates);
    return this.customersRepo.save(customer);
  }

  async updateTier(id: string, tier: CustomerTier): Promise<Customer> {
    const customer = await this.findByIdOrThrow(id);
    customer.tier = tier;
    return this.customersRepo.save(customer);
  }

  async updateKycStatus(id: string, status: KycStatus): Promise<Customer> {
    const customer = await this.findByIdOrThrow(id);
    customer.kycStatus = status;
    if (status === KycStatus.APPROVED) {
      customer.kycCompletedAt = new Date();
      customer.status = CustomerStatus.ACTIVE;
    }
    return this.customersRepo.save(customer);
  }
}
