import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as argon2 from 'argon2';
import { User, UserStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
  ) {}

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email: email.toLowerCase() } });
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  async findByIdOrThrow(id: string): Promise<User> {
    const user = await this.findById(id);
    if (!user) throw new NotFoundException(`User ${id} not found`);
    return user;
  }

  async create(data: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    phone?: string;
    roles?: string[];
    customerId?: string;
  }): Promise<User> {
    const passwordHash = await argon2.hash(data.password, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });

    const user = this.usersRepo.create({
      email: data.email.toLowerCase(),
      passwordHash,
      firstName: data.firstName,
      lastName: data.lastName,
      phone: data.phone ?? null,
      roles: data.roles ?? ['retail_customer'],
      customerId: data.customerId ?? null,
    });

    return this.usersRepo.save(user);
  }

  async updatePassword(userId: string, newPassword: string): Promise<void> {
    const passwordHash = await argon2.hash(newPassword, {
      type: argon2.argon2id,
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4,
    });
    await this.usersRepo.update(userId, { passwordHash });
  }

  async verifyPassword(user: User, password: string): Promise<boolean> {
    return argon2.verify(user.passwordHash, password);
  }

  async recordFailedLogin(userId: string): Promise<void> {
    const user = await this.findByIdOrThrow(userId);
    const attempts = user.failedLoginAttempts + 1;
    const updates: Partial<User> = { failedLoginAttempts: attempts };

    // Lock account after 5 consecutive failures for 30 minutes
    if (attempts >= 5) {
      const lockUntil = new Date();
      lockUntil.setMinutes(lockUntil.getMinutes() + 30);
      updates.lockedUntil = lockUntil;
      updates.status = UserStatus.LOCKED;
    }

    await this.usersRepo.update(userId, updates);
  }

  async recordSuccessfulLogin(userId: string): Promise<void> {
    await this.usersRepo.update(userId, {
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
      status: UserStatus.ACTIVE,
    });
  }

  async setMfaSecret(userId: string, secret: string): Promise<void> {
    await this.usersRepo.update(userId, { mfaSecret: secret });
  }

  async enableMfa(userId: string): Promise<void> {
    await this.usersRepo.update(userId, { mfaEnabled: true });
  }
}
