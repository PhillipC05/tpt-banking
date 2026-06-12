import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ──────────────────────────────────────────────────────────────

export type AssetCategory =
  | 'CASH'
  | 'REAL_ESTATE'
  | 'INVESTMENT'
  | 'RETIREMENT'
  | 'VEHICLE'
  | 'CRYPTO'
  | 'BUSINESS'
  | 'OTHER';

export type LiabilityCategory =
  | 'MORTGAGE'
  | 'AUTO_LOAN'
  | 'STUDENT_LOAN'
  | 'CREDIT_CARD'
  | 'PERSONAL_LOAN'
  | 'HOME_EQUITY'
  | 'OTHER';

export type GoalType =
  | 'RETIREMENT'
  | 'COLLEGE_FUND'
  | 'EMERGENCY_FUND'
  | 'HOME_PURCHASE'
  | 'VACATION'
  | 'DEBT_PAYOFF'
  | 'CUSTOM';

export type GoalStatus = 'ON_TRACK' | 'BEHIND' | 'AT_RISK' | 'ACHIEVED' | 'PAUSED';

export type RiskTolerance =
  | 'CONSERVATIVE'
  | 'MODERATE_CONSERVATIVE'
  | 'MODERATE'
  | 'MODERATE_AGGRESSIVE'
  | 'AGGRESSIVE';

export type EsgPreference =
  | 'NO_FOSSIL_FUELS'
  | 'NO_TOBACCO'
  | 'NO_WEAPONS'
  | 'NO_GAMBLING'
  | 'NO_ALCOHOL'
  | 'ESG_POSITIVE_SCREEN'
  | 'IMPACT_INVESTING';

export type BeneficiaryDesignation = 'PRIMARY' | 'CONTINGENT' | 'TERTIARY';

export type PersonalDocumentType =
  | 'WILL'
  | 'TRUST'
  | 'POWER_OF_ATTORNEY'
  | 'INSURANCE_POLICY'
  | 'TAX_RETURN'
  | 'DEED'
  | 'BROKERAGE_STATEMENT'
  | 'PASSPORT'
  | 'BIRTH_CERTIFICATE'
  | 'OTHER';

// ── Interfaces ─────────────────────────────────────────────────────────────────

export interface PersonalOfficeProfile {
  profileId: string;
  customerId: string;
  householdName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalAsset {
  assetId: string;
  profileId: string;
  name: string;
  category: AssetCategory;
  value: string;
  currency: string;
  description?: string;
  lastUpdated: string;
}

export interface PersonalLiability {
  liabilityId: string;
  profileId: string;
  name: string;
  category: LiabilityCategory;
  balance: string;
  currency: string;
  interestRate?: number;
  minimumPayment?: string;
  lastUpdated: string;
}

export interface FinancialGoal {
  goalId: string;
  profileId: string;
  name: string;
  goalType: GoalType;
  targetAmount: string;
  currentAmount: string;
  currency: string;
  targetDate: string;
  monthlyContribution: string;
  status: GoalStatus;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalIPS {
  ipsId: string;
  profileId: string;
  riskTolerance: RiskTolerance;
  investmentHorizonYears: number;
  targetAllocation: Record<string, number>;
  maxDrawdownPct: number;
  esgPreferences: EsgPreference[];
  createdAt: string;
  updatedAt: string;
}

export interface PersonalBeneficiary {
  beneficiaryId: string;
  profileId: string;
  name: string;
  relationship: string;
  designation: BeneficiaryDesignation;
  allocationPct: number;
  email?: string;
  phone?: string;
  accountIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAccessEntry {
  accessedBy: string;
  accessedAt: string;
  action: string;
}

export interface PersonalDocument {
  documentId: string;
  profileId: string;
  documentType: PersonalDocumentType;
  name: string;
  description?: string;
  contentHash: string;
  vaultKeyRef: string;
  retentionUntil: string;
  uploadedAt: string;
  lastAccessedAt?: string;
  accessLog: DocumentAccessEntry[];
}

// ── Service ────────────────────────────────────────────────────────────────────

@Injectable()
export class PersonalOfficeService {
  private readonly profileStore = new Map<string, PersonalOfficeProfile>();
  private readonly customerProfileIndex = new Map<string, string>(); // customerId → profileId
  private readonly assetStore = new Map<string, PersonalAsset>();
  private readonly liabilityStore = new Map<string, PersonalLiability>();
  private readonly goalStore = new Map<string, FinancialGoal>();
  private readonly ipsStore = new Map<string, PersonalIPS>(); // keyed by profileId
  private readonly beneficiaryStore = new Map<string, PersonalBeneficiary>();
  private readonly documentStore = new Map<string, PersonalDocument>();

  // ── Profile ──────────────────────────────────────────────────────────────────

  createProfile(customerId: string, body: { householdName: string }): PersonalOfficeProfile {
    if (this.customerProfileIndex.has(customerId)) {
      const existingId = this.customerProfileIndex.get(customerId)!;
      return this.profileStore.get(existingId)!;
    }
    const now = new Date().toISOString();
    const profile: PersonalOfficeProfile = {
      profileId: uuidv4(),
      customerId,
      householdName: body.householdName,
      createdAt: now,
      updatedAt: now,
    };
    this.profileStore.set(profile.profileId, profile);
    this.customerProfileIndex.set(customerId, profile.profileId);
    return profile;
  }

  getProfile(customerId: string): PersonalOfficeProfile {
    const profileId = this.customerProfileIndex.get(customerId);
    if (!profileId) throw new NotFoundException('No personal office profile found. Create one first.');
    return this.profileStore.get(profileId)!;
  }

  // ── Net Worth: Assets ─────────────────────────────────────────────────────────

  addAsset(
    customerId: string,
    body: { name: string; category: AssetCategory; value: string; currency: string; description?: string },
  ): PersonalAsset {
    const profile = this.getProfile(customerId);
    const asset: PersonalAsset = {
      assetId: uuidv4(),
      profileId: profile.profileId,
      name: body.name,
      category: body.category,
      value: new Decimal(body.value).toFixed(2),
      currency: (body.currency ?? 'USD').toUpperCase(),
      description: body.description,
      lastUpdated: new Date().toISOString(),
    };
    this.assetStore.set(asset.assetId, asset);
    return asset;
  }

  listAssets(customerId: string): PersonalAsset[] {
    const { profileId } = this.getProfile(customerId);
    return [...this.assetStore.values()].filter(a => a.profileId === profileId);
  }

  updateAsset(
    customerId: string,
    assetId: string,
    body: { value?: string; name?: string; description?: string },
  ): PersonalAsset {
    const { profileId } = this.getProfile(customerId);
    const asset = this.assetStore.get(assetId);
    if (!asset || asset.profileId !== profileId) throw new NotFoundException('Asset not found');
    if (body.value !== undefined) asset.value = new Decimal(body.value).toFixed(2);
    if (body.name !== undefined) asset.name = body.name;
    if (body.description !== undefined) asset.description = body.description;
    asset.lastUpdated = new Date().toISOString();
    return asset;
  }

  removeAsset(customerId: string, assetId: string): { deleted: true } {
    const { profileId } = this.getProfile(customerId);
    const asset = this.assetStore.get(assetId);
    if (!asset || asset.profileId !== profileId) throw new NotFoundException('Asset not found');
    this.assetStore.delete(assetId);
    return { deleted: true };
  }

  // ── Net Worth: Liabilities ────────────────────────────────────────────────────

  addLiability(
    customerId: string,
    body: {
      name: string;
      category: LiabilityCategory;
      balance: string;
      currency: string;
      interestRate?: number;
      minimumPayment?: string;
    },
  ): PersonalLiability {
    const profile = this.getProfile(customerId);
    const liability: PersonalLiability = {
      liabilityId: uuidv4(),
      profileId: profile.profileId,
      name: body.name,
      category: body.category,
      balance: new Decimal(body.balance).toFixed(2),
      currency: (body.currency ?? 'USD').toUpperCase(),
      interestRate: body.interestRate,
      minimumPayment: body.minimumPayment ? new Decimal(body.minimumPayment).toFixed(2) : undefined,
      lastUpdated: new Date().toISOString(),
    };
    this.liabilityStore.set(liability.liabilityId, liability);
    return liability;
  }

  listLiabilities(customerId: string): PersonalLiability[] {
    const { profileId } = this.getProfile(customerId);
    return [...this.liabilityStore.values()].filter(l => l.profileId === profileId);
  }

  updateLiability(
    customerId: string,
    liabilityId: string,
    body: { balance?: string; interestRate?: number; minimumPayment?: string; name?: string },
  ): PersonalLiability {
    const { profileId } = this.getProfile(customerId);
    const liability = this.liabilityStore.get(liabilityId);
    if (!liability || liability.profileId !== profileId) throw new NotFoundException('Liability not found');
    if (body.balance !== undefined) liability.balance = new Decimal(body.balance).toFixed(2);
    if (body.name !== undefined) liability.name = body.name;
    if (body.interestRate !== undefined) liability.interestRate = body.interestRate;
    if (body.minimumPayment !== undefined)
      liability.minimumPayment = new Decimal(body.minimumPayment).toFixed(2);
    liability.lastUpdated = new Date().toISOString();
    return liability;
  }

  removeLiability(customerId: string, liabilityId: string): { deleted: true } {
    const { profileId } = this.getProfile(customerId);
    const liability = this.liabilityStore.get(liabilityId);
    if (!liability || liability.profileId !== profileId) throw new NotFoundException('Liability not found');
    this.liabilityStore.delete(liabilityId);
    return { deleted: true };
  }

  // ── Net Worth Calculation ────────────────────────────────────────────────────

  getNetWorth(customerId: string): {
    totalAssets: string;
    totalLiabilities: string;
    netWorth: string;
    currency: string;
    assetsByCategory: Record<string, string>;
    liabilitiesByCategory: Record<string, string>;
    asOf: string;
  } {
    const { profileId } = this.getProfile(customerId);
    const assets = [...this.assetStore.values()].filter(a => a.profileId === profileId);
    const liabilities = [...this.liabilityStore.values()].filter(l => l.profileId === profileId);

    let totalAssets = new Decimal(0);
    const assetsByCategory: Record<string, Decimal> = {};
    for (const a of assets) {
      totalAssets = totalAssets.plus(a.value);
      assetsByCategory[a.category] = (assetsByCategory[a.category] ?? new Decimal(0)).plus(a.value);
    }

    let totalLiabilities = new Decimal(0);
    const liabilitiesByCategory: Record<string, Decimal> = {};
    for (const l of liabilities) {
      totalLiabilities = totalLiabilities.plus(l.balance);
      liabilitiesByCategory[l.category] = (liabilitiesByCategory[l.category] ?? new Decimal(0)).plus(l.balance);
    }

    return {
      totalAssets: totalAssets.toFixed(2),
      totalLiabilities: totalLiabilities.toFixed(2),
      netWorth: totalAssets.minus(totalLiabilities).toFixed(2),
      currency: 'USD',
      assetsByCategory: Object.fromEntries(
        Object.entries(assetsByCategory).map(([k, v]) => [k, v.toFixed(2)]),
      ),
      liabilitiesByCategory: Object.fromEntries(
        Object.entries(liabilitiesByCategory).map(([k, v]) => [k, v.toFixed(2)]),
      ),
      asOf: new Date().toISOString(),
    };
  }

  // ── Financial Goals ───────────────────────────────────────────────────────────

  createGoal(
    customerId: string,
    body: {
      name: string;
      goalType: GoalType;
      targetAmount: string;
      currentAmount: string;
      currency: string;
      targetDate: string;
      monthlyContribution: string;
    },
  ): FinancialGoal {
    const profile = this.getProfile(customerId);
    const now = new Date().toISOString();
    const goal: FinancialGoal = {
      goalId: uuidv4(),
      profileId: profile.profileId,
      name: body.name,
      goalType: body.goalType,
      targetAmount: new Decimal(body.targetAmount).toFixed(2),
      currentAmount: new Decimal(body.currentAmount).toFixed(2),
      currency: (body.currency ?? 'USD').toUpperCase(),
      targetDate: body.targetDate,
      monthlyContribution: new Decimal(body.monthlyContribution).toFixed(2),
      status: this.computeGoalStatus(body.currentAmount, body.targetAmount, body.targetDate, body.monthlyContribution),
      createdAt: now,
      updatedAt: now,
    };
    this.goalStore.set(goal.goalId, goal);
    return goal;
  }

  listGoals(customerId: string): FinancialGoal[] {
    const { profileId } = this.getProfile(customerId);
    const goals = [...this.goalStore.values()].filter(g => g.profileId === profileId);
    return goals.map(g => ({
      ...g,
      status: g.status === 'PAUSED' ? 'PAUSED' : this.computeGoalStatus(g.currentAmount, g.targetAmount, g.targetDate, g.monthlyContribution),
    }));
  }

  getGoal(
    customerId: string,
    goalId: string,
  ): FinancialGoal & { projectedMonthsToTarget: number | null; projectedCompletionDate: string | null } {
    const { profileId } = this.getProfile(customerId);
    const goal = this.goalStore.get(goalId);
    if (!goal || goal.profileId !== profileId) throw new NotFoundException('Goal not found');

    const gap = new Decimal(goal.targetAmount).minus(goal.currentAmount);
    const monthly = new Decimal(goal.monthlyContribution);
    let projectedMonthsToTarget: number | null = null;
    let projectedCompletionDate: string | null = null;

    if (monthly.gt(0) && gap.gt(0)) {
      projectedMonthsToTarget = Math.ceil(gap.div(monthly).toNumber());
      const completion = new Date();
      completion.setMonth(completion.getMonth() + projectedMonthsToTarget);
      projectedCompletionDate = completion.toISOString().slice(0, 10);
    } else if (gap.lte(0)) {
      projectedMonthsToTarget = 0;
      projectedCompletionDate = new Date().toISOString().slice(0, 10);
    }

    const status = goal.status === 'PAUSED'
      ? 'PAUSED'
      : this.computeGoalStatus(goal.currentAmount, goal.targetAmount, goal.targetDate, goal.monthlyContribution);

    return { ...goal, status, projectedMonthsToTarget, projectedCompletionDate };
  }

  updateGoal(
    customerId: string,
    goalId: string,
    body: {
      name?: string;
      currentAmount?: string;
      monthlyContribution?: string;
      targetDate?: string;
      status?: GoalStatus;
    },
  ): FinancialGoal {
    const { profileId } = this.getProfile(customerId);
    const goal = this.goalStore.get(goalId);
    if (!goal || goal.profileId !== profileId) throw new NotFoundException('Goal not found');

    if (body.name !== undefined) goal.name = body.name;
    if (body.currentAmount !== undefined) goal.currentAmount = new Decimal(body.currentAmount).toFixed(2);
    if (body.monthlyContribution !== undefined) goal.monthlyContribution = new Decimal(body.monthlyContribution).toFixed(2);
    if (body.targetDate !== undefined) goal.targetDate = body.targetDate;
    if (body.status !== undefined) goal.status = body.status;
    goal.updatedAt = new Date().toISOString();

    if (goal.status !== 'PAUSED') {
      goal.status = this.computeGoalStatus(goal.currentAmount, goal.targetAmount, goal.targetDate, goal.monthlyContribution);
    }
    return goal;
  }

  removeGoal(customerId: string, goalId: string): { deleted: true } {
    const { profileId } = this.getProfile(customerId);
    const goal = this.goalStore.get(goalId);
    if (!goal || goal.profileId !== profileId) throw new NotFoundException('Goal not found');
    this.goalStore.delete(goalId);
    return { deleted: true };
  }

  private computeGoalStatus(
    currentAmount: string,
    targetAmount: string,
    targetDate: string,
    monthlyContribution: string,
  ): GoalStatus {
    const current = new Decimal(currentAmount);
    const target = new Decimal(targetAmount);
    if (current.gte(target)) return 'ACHIEVED';

    const gap = target.minus(current);
    const monthly = new Decimal(monthlyContribution);
    const monthsRemaining = Math.max(
      0,
      (new Date(targetDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30.44),
    );

    if (monthsRemaining <= 0) return 'AT_RISK';
    if (monthly.lte(0)) return 'BEHIND';

    const projectedAccumulation = monthly.times(monthsRemaining);
    const progressRatio = projectedAccumulation.div(gap).toNumber();

    if (progressRatio >= 1.0) return 'ON_TRACK';
    if (progressRatio >= 0.8) return 'BEHIND';
    return 'AT_RISK';
  }

  // ── Personal IPS ──────────────────────────────────────────────────────────────

  setIPS(
    customerId: string,
    body: {
      riskTolerance: RiskTolerance;
      investmentHorizonYears: number;
      targetAllocation: Record<string, number>;
      maxDrawdownPct: number;
      esgPreferences: EsgPreference[];
    },
  ): PersonalIPS {
    const { profileId } = this.getProfile(customerId);

    const allocationTotal = Object.values(body.targetAllocation).reduce((sum, v) => sum + v, 0);
    if (Math.abs(allocationTotal - 100) > 0.01) {
      throw new BadRequestException(`Target allocation must sum to 100 (got ${allocationTotal.toFixed(2)})`);
    }

    const now = new Date().toISOString();
    const existing = this.ipsStore.get(profileId);
    const ips: PersonalIPS = {
      ipsId: existing?.ipsId ?? uuidv4(),
      profileId,
      riskTolerance: body.riskTolerance,
      investmentHorizonYears: body.investmentHorizonYears,
      targetAllocation: body.targetAllocation,
      maxDrawdownPct: body.maxDrawdownPct,
      esgPreferences: body.esgPreferences,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };
    this.ipsStore.set(profileId, ips);
    return ips;
  }

  getIPS(customerId: string): PersonalIPS {
    const { profileId } = this.getProfile(customerId);
    const ips = this.ipsStore.get(profileId);
    if (!ips) throw new NotFoundException('No investment policy statement found. Create one first.');
    return ips;
  }

  // ── Beneficiaries ─────────────────────────────────────────────────────────────

  addBeneficiary(
    customerId: string,
    body: {
      name: string;
      relationship: string;
      designation: BeneficiaryDesignation;
      allocationPct: number;
      email?: string;
      phone?: string;
      accountIds?: string[];
    },
  ): PersonalBeneficiary {
    const profile = this.getProfile(customerId);

    const existing = [...this.beneficiaryStore.values()].filter(
      b => b.profileId === profile.profileId && b.designation === body.designation,
    );
    const totalPct = existing.reduce((sum, b) => sum + b.allocationPct, 0);
    if (totalPct + body.allocationPct > 100) {
      throw new BadRequestException(
        `Adding ${body.allocationPct}% would exceed 100% for ${body.designation} designation (current total: ${totalPct}%)`,
      );
    }

    const now = new Date().toISOString();
    const beneficiary: PersonalBeneficiary = {
      beneficiaryId: uuidv4(),
      profileId: profile.profileId,
      name: body.name,
      relationship: body.relationship,
      designation: body.designation,
      allocationPct: body.allocationPct,
      email: body.email,
      phone: body.phone,
      accountIds: body.accountIds ?? [],
      createdAt: now,
      updatedAt: now,
    };
    this.beneficiaryStore.set(beneficiary.beneficiaryId, beneficiary);
    return beneficiary;
  }

  listBeneficiaries(customerId: string): PersonalBeneficiary[] {
    const { profileId } = this.getProfile(customerId);
    return [...this.beneficiaryStore.values()].filter(b => b.profileId === profileId);
  }

  updateBeneficiary(
    customerId: string,
    beneficiaryId: string,
    body: { name?: string; relationship?: string; allocationPct?: number; email?: string; phone?: string; accountIds?: string[] },
  ): PersonalBeneficiary {
    const { profileId } = this.getProfile(customerId);
    const beneficiary = this.beneficiaryStore.get(beneficiaryId);
    if (!beneficiary || beneficiary.profileId !== profileId) throw new NotFoundException('Beneficiary not found');

    if (body.allocationPct !== undefined) {
      const peers = [...this.beneficiaryStore.values()].filter(
        b => b.profileId === profileId && b.designation === beneficiary.designation && b.beneficiaryId !== beneficiaryId,
      );
      const totalOthers = peers.reduce((sum, b) => sum + b.allocationPct, 0);
      if (totalOthers + body.allocationPct > 100) {
        throw new BadRequestException(
          `Setting ${body.allocationPct}% would exceed 100% for ${beneficiary.designation} designation`,
        );
      }
      beneficiary.allocationPct = body.allocationPct;
    }

    if (body.name !== undefined) beneficiary.name = body.name;
    if (body.relationship !== undefined) beneficiary.relationship = body.relationship;
    if (body.email !== undefined) beneficiary.email = body.email;
    if (body.phone !== undefined) beneficiary.phone = body.phone;
    if (body.accountIds !== undefined) beneficiary.accountIds = body.accountIds;
    beneficiary.updatedAt = new Date().toISOString();
    return beneficiary;
  }

  removeBeneficiary(customerId: string, beneficiaryId: string): { deleted: true } {
    const { profileId } = this.getProfile(customerId);
    const beneficiary = this.beneficiaryStore.get(beneficiaryId);
    if (!beneficiary || beneficiary.profileId !== profileId) throw new NotFoundException('Beneficiary not found');
    this.beneficiaryStore.delete(beneficiaryId);
    return { deleted: true };
  }

  // ── Document Vault ────────────────────────────────────────────────────────────

  storeDocument(
    customerId: string,
    body: { documentType: PersonalDocumentType; name: string; description?: string },
  ): PersonalDocument {
    const { profileId } = this.getProfile(customerId);
    const documentId = uuidv4();
    const now = new Date().toISOString();

    const doc: PersonalDocument = {
      documentId,
      profileId,
      documentType: body.documentType,
      name: body.name,
      description: body.description,
      contentHash: `sha256:${uuidv4().replace(/-/g, '')}`,
      vaultKeyRef: `vault://tpt-bank/personal-office/${profileId}/doc-keys/${documentId}`,
      retentionUntil: this.retentionDate(body.documentType),
      uploadedAt: now,
      accessLog: [{ accessedBy: customerId, accessedAt: now, action: 'UPLOAD' }],
    };
    this.documentStore.set(documentId, doc);
    return doc;
  }

  listDocuments(customerId: string): Omit<PersonalDocument, 'accessLog'>[] {
    const { profileId } = this.getProfile(customerId);
    return [...this.documentStore.values()]
      .filter(d => d.profileId === profileId)
      .map(({ accessLog: _al, ...rest }) => rest);
  }

  getDocument(customerId: string, documentId: string): PersonalDocument {
    const { profileId } = this.getProfile(customerId);
    const doc = this.documentStore.get(documentId);
    if (!doc || doc.profileId !== profileId) throw new NotFoundException('Document not found');

    const now = new Date().toISOString();
    doc.accessLog.push({ accessedBy: customerId, accessedAt: now, action: 'READ' });
    doc.lastAccessedAt = now;
    return doc;
  }

  removeDocument(customerId: string, documentId: string): { deleted: true } {
    const { profileId } = this.getProfile(customerId);
    const doc = this.documentStore.get(documentId);
    if (!doc || doc.profileId !== profileId) throw new NotFoundException('Document not found');
    this.documentStore.delete(documentId);
    return { deleted: true };
  }

  private retentionDate(docType: PersonalDocumentType): string {
    const years: Record<PersonalDocumentType, number> = {
      TAX_RETURN: 7,
      WILL: 99,
      TRUST: 99,
      POWER_OF_ATTORNEY: 99,
      DEED: 99,
      INSURANCE_POLICY: 10,
      BROKERAGE_STATEMENT: 7,
      PASSPORT: 10,
      BIRTH_CERTIFICATE: 99,
      OTHER: 7,
    };
    const d = new Date();
    d.setFullYear(d.getFullYear() + (years[docType] ?? 7));
    return d.toISOString().slice(0, 10);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  getDashboard(customerId: string): {
    profile: PersonalOfficeProfile;
    netWorth: ReturnType<PersonalOfficeService['getNetWorth']>;
    goalsOverview: { total: number; onTrack: number; behind: number; atRisk: number; achieved: number; paused: number };
    ips: PersonalIPS | null;
    beneficiarySummary: { total: number; primary: number; contingent: number; tertiary: number };
    vaultSummary: { total: number; byType: Record<string, number> };
  } {
    const profile = this.getProfile(customerId);
    const { profileId } = profile;
    const netWorth = this.getNetWorth(customerId);

    const goals = [...this.goalStore.values()].filter(g => g.profileId === profileId);
    const statuses = goals.map(g =>
      g.status === 'PAUSED'
        ? 'PAUSED'
        : this.computeGoalStatus(g.currentAmount, g.targetAmount, g.targetDate, g.monthlyContribution),
    );
    const goalsOverview = {
      total: goals.length,
      onTrack: statuses.filter(s => s === 'ON_TRACK').length,
      behind: statuses.filter(s => s === 'BEHIND').length,
      atRisk: statuses.filter(s => s === 'AT_RISK').length,
      achieved: statuses.filter(s => s === 'ACHIEVED').length,
      paused: statuses.filter(s => s === 'PAUSED').length,
    };

    const ips = this.ipsStore.get(profileId) ?? null;

    const beneficiaries = [...this.beneficiaryStore.values()].filter(b => b.profileId === profileId);
    const beneficiarySummary = {
      total: beneficiaries.length,
      primary: beneficiaries.filter(b => b.designation === 'PRIMARY').length,
      contingent: beneficiaries.filter(b => b.designation === 'CONTINGENT').length,
      tertiary: beneficiaries.filter(b => b.designation === 'TERTIARY').length,
    };

    const docs = [...this.documentStore.values()].filter(d => d.profileId === profileId);
    const byType: Record<string, number> = {};
    for (const d of docs) byType[d.documentType] = (byType[d.documentType] ?? 0) + 1;
    const vaultSummary = { total: docs.length, byType };

    return { profile, netWorth, goalsOverview, ips, beneficiarySummary, vaultSummary };
  }
}
