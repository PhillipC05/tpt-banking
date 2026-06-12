import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AmlRulesEngine, TransactionContext } from '../aml-rules.engine';
import { AmlRuleCode, AmlAlertSeverity } from '@tpt/database';

// ── Mock repository ───────────────────────────────────────────────────────────

interface QueryBuilder {
  where: jest.Mock;
  andWhere: jest.Mock;
  getMany: jest.Mock;
  getCount: jest.Mock;
}

function makeMockRepo(countResult = 0, manyResult: unknown[] = []): { createQueryBuilder: jest.Mock } {
  const qb: QueryBuilder = {
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    getMany: jest.fn().mockResolvedValue(manyResult),
    getCount: jest.fn().mockResolvedValue(countResult),
  };
  return { createQueryBuilder: jest.fn().mockReturnValue(qb) };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TransactionContext> = {}): TransactionContext {
  return {
    transactionId: 'txn-1',
    customerId: 'cust-1',
    accountId: 'acct-1',
    amount: 100,
    currency: 'USD',
    type: 'TRANSFER',
    createdAt: new Date('2024-01-15T10:00:00Z'),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AmlRulesEngine', () => {
  let engine: AmlRulesEngine;
  let repo: { createQueryBuilder: jest.Mock };

  async function buildEngine(r = makeMockRepo()): Promise<void> {
    repo = r;
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AmlRulesEngine,
        { provide: getRepositoryToken('Transaction'), useValue: repo },
      ],
    }).compile();

    engine = module.get(AmlRulesEngine);
  }

  beforeEach(async () => {
    await buildEngine();
  });

  // ── CTR threshold ───────────────────────────────────────────────────────────

  describe('CTR threshold rule', () => {
    it('does not fire for non-cash transactions', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'TRANSFER', amount: 15_000 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.CTR_THRESHOLD)).toBeUndefined();
    });

    it('does not fire for cash below $10,000', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'DEPOSIT', amount: 9_999 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.CTR_THRESHOLD)).toBeUndefined();
    });

    it('fires for cash deposit exactly $10,000', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'DEPOSIT', amount: 10_000 }));
      const ctr = violations.find((v) => v.ruleCode === AmlRuleCode.CTR_THRESHOLD);
      expect(ctr).toBeDefined();
      expect(ctr!.severity).toBe(AmlAlertSeverity.HIGH);
      expect(ctr!.riskScore).toBe(80);
    });

    it('fires for cash withdrawal above $10,000', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'WITHDRAWAL', amount: 25_000 }));
      const ctr = violations.find((v) => v.ruleCode === AmlRuleCode.CTR_THRESHOLD);
      expect(ctr).toBeDefined();
    });
  });

  // ── Large wire ──────────────────────────────────────────────────────────────

  describe('large wire rule', () => {
    it('does not fire for non-wire transactions', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'TRANSFER', amount: 100_000 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.LARGE_WIRE_TRANSFER)).toBeUndefined();
    });

    it('does not fire for wire below $50,000', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'WIRE', amount: 49_999 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.LARGE_WIRE_TRANSFER)).toBeUndefined();
    });

    it('fires HIGH severity for wire $50,000–$500,000', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'WIRE', amount: 200_000 }));
      const lw = violations.find((v) => v.ruleCode === AmlRuleCode.LARGE_WIRE_TRANSFER);
      expect(lw).toBeDefined();
      expect(lw!.severity).toBe(AmlAlertSeverity.HIGH);
      expect(lw!.riskScore).toBe(70);
    });

    it('fires CRITICAL severity for wire above $500,000', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'WIRE', amount: 600_000 }));
      const lw = violations.find((v) => v.ruleCode === AmlRuleCode.LARGE_WIRE_TRANSFER);
      expect(lw).toBeDefined();
      expect(lw!.severity).toBe(AmlAlertSeverity.CRITICAL);
      expect(lw!.riskScore).toBe(90);
    });

    it('fires for SWIFT type as well', async () => {
      const violations = await engine.evaluate(makeCtx({ type: 'SWIFT', amount: 75_000 }));
      const lw = violations.find((v) => v.ruleCode === AmlRuleCode.LARGE_WIRE_TRANSFER);
      expect(lw).toBeDefined();
    });
  });

  // ── High-risk jurisdiction ───────────────────────────────────────────────────

  describe('high-risk jurisdiction rule', () => {
    it('does not fire when no counterpartyCountry', async () => {
      const violations = await engine.evaluate(makeCtx({ counterpartyCountry: undefined }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_RISK_JURISDICTION)).toBeUndefined();
    });

    it('does not fire for safe jurisdiction', async () => {
      const violations = await engine.evaluate(makeCtx({ counterpartyCountry: 'US' }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_RISK_JURISDICTION)).toBeUndefined();
    });

    it('fires CRITICAL for Iran (IR)', async () => {
      const violations = await engine.evaluate(makeCtx({ counterpartyCountry: 'IR' }));
      const hit = violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_RISK_JURISDICTION);
      expect(hit).toBeDefined();
      expect(hit!.severity).toBe(AmlAlertSeverity.CRITICAL);
      expect(hit!.riskScore).toBe(95);
    });

    it('fires for North Korea (KP)', async () => {
      const violations = await engine.evaluate(makeCtx({ counterpartyCountry: 'KP' }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_RISK_JURISDICTION)).toBeDefined();
    });

    it('is case-insensitive for country code', async () => {
      const violations = await engine.evaluate(makeCtx({ counterpartyCountry: 'ir' }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_RISK_JURISDICTION)).toBeDefined();
    });

    it('fires for all sanctioned countries', async () => {
      const sanctioned = ['IR', 'KP', 'SY', 'CU', 'SD', 'MM', 'LY', 'BY', 'AF', 'YE'];
      for (const country of sanctioned) {
        const violations = await engine.evaluate(makeCtx({ counterpartyCountry: country }));
        expect(
          violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_RISK_JURISDICTION),
        ).toBeDefined();
      }
    });
  });

  // ── High velocity ────────────────────────────────────────────────────────────

  describe('high velocity rule', () => {
    it('does not fire for low-value transactions', async () => {
      const violations = await engine.evaluate(makeCtx({ amount: 500 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_VELOCITY_TRANSFERS)).toBeUndefined();
    });

    it('does not fire when count is within threshold', async () => {
      await buildEngine(makeMockRepo(8)); // 8 + 1 = 9, threshold is 10
      const violations = await engine.evaluate(makeCtx({ amount: 2_000 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_VELOCITY_TRANSFERS)).toBeUndefined();
    });

    it('fires when count exceeds threshold', async () => {
      await buildEngine(makeMockRepo(10)); // 10 + 1 = 11 > 10
      const violations = await engine.evaluate(makeCtx({ amount: 2_000 }));
      const hv = violations.find((v) => v.ruleCode === AmlRuleCode.HIGH_VELOCITY_TRANSFERS);
      expect(hv).toBeDefined();
      expect(hv!.severity).toBe(AmlAlertSeverity.MEDIUM);
    });
  });

  // ── Round dollar ─────────────────────────────────────────────────────────────

  describe('round dollar rule', () => {
    it('does not fire below $10,000', async () => {
      await buildEngine(makeMockRepo(5));
      const violations = await engine.evaluate(makeCtx({ amount: 5_000 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.ROUND_DOLLAR_TRANSACTIONS)).toBeUndefined();
    });

    it('does not fire for non-round amount', async () => {
      await buildEngine(makeMockRepo(5));
      const violations = await engine.evaluate(makeCtx({ amount: 10_500 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.ROUND_DOLLAR_TRANSACTIONS)).toBeUndefined();
    });

    it('does not fire when not enough history (< 2 previous)', async () => {
      await buildEngine(makeMockRepo(1));
      const violations = await engine.evaluate(makeCtx({ amount: 15_000 }));
      expect(violations.find((v) => v.ruleCode === AmlRuleCode.ROUND_DOLLAR_TRANSACTIONS)).toBeUndefined();
    });

    it('fires when enough round-dollar history exists', async () => {
      await buildEngine(makeMockRepo(3)); // 3 prior + 1 current ≥ 2 threshold
      const violations = await engine.evaluate(makeCtx({ amount: 20_000 }));
      const rd = violations.find((v) => v.ruleCode === AmlRuleCode.ROUND_DOLLAR_TRANSACTIONS);
      expect(rd).toBeDefined();
      expect(rd!.severity).toBe(AmlAlertSeverity.LOW);
      expect(rd!.riskScore).toBe(40);
    });
  });

  // ── Multi-rule co-firing ──────────────────────────────────────────────────────

  describe('multiple rules can fire simultaneously', () => {
    it('CTR and high-risk jurisdiction can co-fire', async () => {
      const violations = await engine.evaluate(
        makeCtx({ type: 'DEPOSIT', amount: 15_000, counterpartyCountry: 'KP' }),
      );
      const codes = violations.map((v) => v.ruleCode);
      expect(codes).toContain(AmlRuleCode.CTR_THRESHOLD);
      expect(codes).toContain(AmlRuleCode.HIGH_RISK_JURISDICTION);
    });

    it('returns empty array for benign low-value domestic transfer', async () => {
      const violations = await engine.evaluate(
        makeCtx({ amount: 50, type: 'TRANSFER', counterpartyCountry: 'US' }),
      );
      expect(violations).toHaveLength(0);
    });
  });

  // ── Error resilience ──────────────────────────────────────────────────────────

  describe('rule evaluation resilience', () => {
    it('continues evaluating remaining rules when one rule throws', async () => {
      const brokenRepo = {
        createQueryBuilder: jest.fn().mockImplementation(() => {
          throw new Error('DB down');
        }),
      };
      await buildEngine(brokenRepo);

      // Should not throw — rule errors are logged, not propagated
      const violations = await engine.evaluate(
        makeCtx({ type: 'DEPOSIT', amount: 15_000, counterpartyCountry: 'IR' }),
      );

      // CTR and high-risk jurisdiction are sync checks that don't use the repo
      const codes = violations.map((v) => v.ruleCode);
      expect(codes).toContain(AmlRuleCode.CTR_THRESHOLD);
      expect(codes).toContain(AmlRuleCode.HIGH_RISK_JURISDICTION);
    });
  });
});
