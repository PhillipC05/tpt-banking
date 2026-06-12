/**
 * Integration tests for the Customer entity and its PostgreSQL mappings.
 *
 * Requires: Docker dev stack running (npm run docker:up) with the test DB set up.
 * Run with:  DATABASE_NAME=tpt_banking_test npx jest --config packages/database/jest.config.ts
 */
import { DataSource, Repository } from 'typeorm';
import { createTestDataSource, truncateTables } from './helpers';
import {
  Customer,
  CustomerStatus,
  CustomerTier,
  KycStatus,
} from '../../entities/customer.entity';

describe('Customer entity — integration', () => {
  let ds: DataSource;
  let repo: Repository<Customer>;

  beforeAll(async () => {
    ds = await createTestDataSource();
    repo = ds.getRepository(Customer);
  });

  afterAll(async () => {
    await ds.destroy();
  });

  beforeEach(async () => {
    await truncateTables(ds, ['customers']);
  });

  // ── CRUD ─────────────────────────────────────────────────────────────────────

  describe('create and read', () => {
    it('persists a minimal customer and reads it back', async () => {
      const customer = repo.create({
        email: 'alice@example.com',
        phone: '+1-555-0100',
        firstName: 'Alice',
        lastName: 'Smith',
        dateOfBirth: new Date('1985-03-15'),
        nationality: 'US',
        status: CustomerStatus.PROSPECT,
        tier: CustomerTier.RETAIL,
        kycStatus: KycStatus.NOT_STARTED,
      });

      const saved = await repo.save(customer);
      expect(saved.id).toBeTruthy();
      expect(saved.customerNumber).toMatch(/^CIF-[0-9A-F]{8}$/);

      const found = await repo.findOneByOrFail({ id: saved.id });
      expect(found.email).toBe('alice@example.com');
      expect(found.firstName).toBe('Alice');
      expect(found.lastName).toBe('Smith');
    });

    it('auto-generates unique customer numbers', async () => {
      const customers = await Promise.all(
        ['alice@example.com', 'bob@example.com', 'charlie@example.com'].map((email) =>
          repo.save(
            repo.create({
              email,
              firstName: 'Test',
              lastName: 'User',
              dateOfBirth: new Date('1990-01-01'),
              nationality: 'US',
              status: CustomerStatus.PROSPECT,
              tier: CustomerTier.RETAIL,
              kycStatus: KycStatus.NOT_STARTED,
            }),
          ),
        ),
      );

      const numbers = customers.map((c) => c.customerNumber);
      expect(new Set(numbers).size).toBe(3);
    });
  });

  // ── Unique constraints ───────────────────────────────────────────────────────

  describe('unique constraints', () => {
    it('rejects duplicate email', async () => {
      const base = {
        firstName: 'Test',
        lastName: 'User',
        dateOfBirth: new Date('1990-01-01'),
        nationality: 'US',
        status: CustomerStatus.PROSPECT,
        tier: CustomerTier.RETAIL,
        kycStatus: KycStatus.NOT_STARTED,
      };

      await repo.save(repo.create({ ...base, email: 'dup@example.com' }));

      await expect(
        repo.save(repo.create({ ...base, email: 'dup@example.com' })),
      ).rejects.toThrow();
    });
  });

  // ── Status and tier transitions ───────────────────────────────────────────────

  describe('field updates', () => {
    it('transitions KYC status', async () => {
      const customer = await repo.save(
        repo.create({
          email: 'kyc@example.com',
          firstName: 'KYC',
          lastName: 'Tester',
          dateOfBirth: new Date('1980-06-01'),
          nationality: 'GB',
          status: CustomerStatus.PENDING_KYC,
          tier: CustomerTier.RETAIL,
          kycStatus: KycStatus.IN_PROGRESS,
        }),
      );

      customer.kycStatus = KycStatus.APPROVED;
      customer.status = CustomerStatus.ACTIVE;
      customer.kycCompletedAt = new Date();
      await repo.save(customer);

      const updated = await repo.findOneByOrFail({ id: customer.id });
      expect(updated.kycStatus).toBe(KycStatus.APPROVED);
      expect(updated.status).toBe(CustomerStatus.ACTIVE);
      expect(updated.kycCompletedAt).toBeTruthy();
    });

    it('upgrades customer tier', async () => {
      const customer = await repo.save(
        repo.create({
          email: 'tier@example.com',
          firstName: 'Tier',
          lastName: 'Upgrade',
          dateOfBirth: new Date('1975-09-12'),
          nationality: 'US',
          status: CustomerStatus.ACTIVE,
          tier: CustomerTier.RETAIL,
          kycStatus: KycStatus.APPROVED,
        }),
      );

      customer.tier = CustomerTier.HNW;
      await repo.save(customer);

      const updated = await repo.findOneByOrFail({ id: customer.id });
      expect(updated.tier).toBe(CustomerTier.HNW);
    });
  });

  // ── PII column (encrypted SSN) ────────────────────────────────────────────────

  describe('ssnEncrypted column', () => {
    it('stores and retrieves a ciphertext string', async () => {
      const fakeCiphertext = 'vault:v1:AAAAAAAAAAAAAAAAAABBBBBBBB==';
      const customer = await repo.save(
        repo.create({
          email: 'ssn@example.com',
          firstName: 'SSN',
          lastName: 'Test',
          dateOfBirth: new Date('1990-01-01'),
          nationality: 'US',
          status: CustomerStatus.ACTIVE,
          tier: CustomerTier.RETAIL,
          kycStatus: KycStatus.APPROVED,
          ssnEncrypted: fakeCiphertext,
          ssnLast4: '1234',
        }),
      );

      const found = await repo.findOneByOrFail({ id: customer.id });
      // The transformer converts Buffer → string on read
      expect(typeof found.ssnEncrypted).toBe('string');
      expect(found.ssnEncrypted).toBe(fakeCiphertext);
      expect(found.ssnLast4).toBe('1234');
    });

    it('stores null when SSN is not provided', async () => {
      const customer = await repo.save(
        repo.create({
          email: 'nossn@example.com',
          firstName: 'No',
          lastName: 'SSN',
          dateOfBirth: new Date('1990-01-01'),
          nationality: 'DE',
          status: CustomerStatus.ACTIVE,
          tier: CustomerTier.RETAIL,
          kycStatus: KycStatus.APPROVED,
        }),
      );

      const found = await repo.findOneByOrFail({ id: customer.id });
      expect(found.ssnEncrypted).toBeNull();
      expect(found.ssnLast4).toBeNull();
    });
  });

  // ── Querying ─────────────────────────────────────────────────────────────────

  describe('querying', () => {
    it('finds by email index', async () => {
      await repo.save(
        repo.create({
          email: 'findme@example.com',
          firstName: 'Find',
          lastName: 'Me',
          dateOfBirth: new Date('1988-04-20'),
          nationality: 'CA',
          status: CustomerStatus.ACTIVE,
          tier: CustomerTier.PREFERRED,
          kycStatus: KycStatus.APPROVED,
        }),
      );

      const found = await repo.findOneBy({ email: 'findme@example.com' });
      expect(found).not.toBeNull();
      expect(found!.tier).toBe(CustomerTier.PREFERRED);
    });

    it('filters by status', async () => {
      await repo.save([
        repo.create({ email: 'active1@example.com', firstName: 'A1', lastName: 'L', dateOfBirth: new Date('1990-01-01'), nationality: 'US', status: CustomerStatus.ACTIVE, tier: CustomerTier.RETAIL, kycStatus: KycStatus.APPROVED }),
        repo.create({ email: 'active2@example.com', firstName: 'A2', lastName: 'L', dateOfBirth: new Date('1990-01-01'), nationality: 'US', status: CustomerStatus.ACTIVE, tier: CustomerTier.RETAIL, kycStatus: KycStatus.APPROVED }),
        repo.create({ email: 'suspended@example.com', firstName: 'S1', lastName: 'L', dateOfBirth: new Date('1990-01-01'), nationality: 'US', status: CustomerStatus.SUSPENDED, tier: CustomerTier.RETAIL, kycStatus: KycStatus.APPROVED }),
      ]);

      const active = await repo.findBy({ status: CustomerStatus.ACTIVE });
      expect(active.length).toBe(2);

      const suspended = await repo.findBy({ status: CustomerStatus.SUSPENDED });
      expect(suspended.length).toBe(1);
    });
  });

  // ── Computed properties ───────────────────────────────────────────────────────

  describe('computed properties', () => {
    it('fullName concatenates correctly', async () => {
      const customer = await repo.save(
        repo.create({
          email: 'fullname@example.com',
          firstName: 'John',
          middleName: 'Michael',
          lastName: 'Doe',
          dateOfBirth: new Date('1985-07-04'),
          nationality: 'US',
          status: CustomerStatus.ACTIVE,
          tier: CustomerTier.RETAIL,
          kycStatus: KycStatus.APPROVED,
        }),
      );

      const found = await repo.findOneByOrFail({ id: customer.id });
      expect(found.fullName).toBe('John Michael Doe');
    });

    it('fullName skips null middle name', async () => {
      const customer = await repo.save(
        repo.create({
          email: 'nomiddle@example.com',
          firstName: 'Jane',
          lastName: 'Doe',
          dateOfBirth: new Date('1990-01-01'),
          nationality: 'US',
          status: CustomerStatus.ACTIVE,
          tier: CustomerTier.RETAIL,
          kycStatus: KycStatus.APPROVED,
        }),
      );

      const found = await repo.findOneByOrFail({ id: customer.id });
      expect(found.fullName).toBe('Jane Doe');
    });
  });
});
