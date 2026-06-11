import {
  Injectable, Logger, NotFoundException, BadRequestException, ConflictException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import { v4 as uuidv4 } from 'uuid';

// ── Enums & Types ─────────────────────────────────────────────────────────────

export type TrustType =
  | 'REVOCABLE_LIVING'
  | 'IRREVOCABLE'
  | 'TESTAMENTARY'
  | 'CHARITABLE_REMAINDER'
  | 'CHARITABLE_LEAD'
  | 'SPECIAL_NEEDS'
  | 'SPENDTHRIFT'
  | 'DYNASTY'
  | 'BLIND';

export type TrustStatus =
  | 'DRAFT'
  | 'EXECUTED'
  | 'ACTIVE'
  | 'AMENDMENT_IN_PROGRESS'
  | 'TERMINATING'
  | 'TERMINATED';

export type TrusteeRole =
  | 'GRANTOR'
  | 'TRUSTEE'
  | 'CO_TRUSTEE'
  | 'SUCCESSOR_TRUSTEE'
  | 'PROTECTOR'
  | 'TRUST_ADVISOR'
  | 'INVESTMENT_ADVISOR';

export type DistributionStandard =
  | 'DISCRETIONARY'
  | 'MANDATORY'
  | 'HEMS'                // Health, Education, Maintenance, Support
  | 'ASCERTAINABLE_STANDARD'
  | 'UNITRUST_PCT'        // fixed % of trust value annually
  | 'CHARITABLE_ANNUITY'; // fixed dollar annuity to charity

export type TrustDistributionClass = 'INCOME' | 'PRINCIPAL' | 'BOTH';

export type EstateAssetType =
  | 'REAL_PROPERTY'
  | 'FINANCIAL_ACCOUNT'
  | 'RETIREMENT_ACCOUNT'
  | 'BUSINESS_INTEREST'
  | 'PERSONAL_PROPERTY'
  | 'INTELLECTUAL_PROPERTY'
  | 'LIFE_INSURANCE'
  | 'ANNUITY'
  | 'CRYPTOCURRENCY'
  | 'OTHER';

export type DispositionMethod =
  | 'PROBATE'
  | 'JOINT_TENANCY'
  | 'BENEFICIARY_DESIGNATION'
  | 'TRUST'
  | 'INTESTATE';

export type EstateStatus =
  | 'OPEN'
  | 'PROBATE_IN_PROGRESS'
  | 'CREDITOR_NOTICE_PERIOD'
  | 'ASSETS_INVENTORIED'
  | 'DISTRIBUTION_IN_PROGRESS'
  | 'CLOSED';

// ── Core Interfaces ───────────────────────────────────────────────────────────

export interface TrustParty {
  partyId: string;
  trustId: string;
  role: TrusteeRole;
  name: string;
  taxId: string | null;
  email: string | null;
  phone: string | null;
  effectiveDate: string;
  endDate: string | null;
  notes: string;
}

export interface TrustBeneficiary {
  beneficiaryId: string;
  trustId: string;
  name: string;
  taxId: string | null;
  distributionClass: TrustDistributionClass;
  distributionStandard: DistributionStandard;
  distributionPct: string | null;      // for fixed-ratio trusts
  unitrustPct: string | null;          // for UNITRUST_PCT
  charitableAnnuityAmount: string | null;
  ageOfDistribution: number | null;    // beneficiary must attain this age
  isCharitable: boolean;
  totalDistributions: string;
  notes: string;
}

export interface Trust {
  trustId: string;
  trustName: string;
  trustType: TrustType;
  status: TrustStatus;
  jurisdiction: string;
  taxId: string | null;                // Federal EIN (irrevocable) or grantor's SSN (revocable)
  principalBalance: string;
  incomeBalance: string;
  inceptionDate: string | null;
  terminationDate: string | null;
  documentRef: string | null;          // reference to vault documentId
  lastAmendmentDate: string | null;
  adminNotes: string;
  parties: TrustParty[];
  beneficiaries: TrustBeneficiary[];
}

export interface TrustDistribution {
  distributionId: string;
  trustId: string;
  beneficiaryId: string;
  beneficiaryName: string;
  amount: string;
  distributionClass: TrustDistributionClass;
  standard: DistributionStandard;
  distributionDate: string;
  taxWithheld: string;
  taxCategory: 'ORDINARY_INCOME' | 'QUALIFIED_DIVIDEND' | 'CAPITAL_GAIN' | 'RETURN_OF_PRINCIPAL' | 'TAX_EXEMPT';
  checkRef: string | null;
  approvedBy: string;
  notes: string;
}

export interface TrustAccountingPeriod {
  periodId: string;
  trustId: string;
  startDate: string;
  endDate: string;
  openingPrincipal: string;
  openingIncome: string;
  investmentIncome: string;          // dividends, interest
  capitalGains: string;
  trustExpenses: string;
  taxesWithheld: string;
  distributionsToIncome: string;
  distributionsToPrincipal: string;
  closingPrincipal: string;
  closingIncome: string;
  netInvestmentIncome: string;       // for NIIT purposes
}

export interface TrustAmendment {
  amendmentId: string;
  trustId: string;
  amendmentDate: string;
  description: string;
  recordedBy: string;
  documentRef: string | null;
}

// ── Estate interfaces ─────────────────────────────────────────────────────────

export interface EstateCase {
  caseId: string;
  decedentName: string;
  dateOfDeath: string;
  jurisdiction: string;
  taxId: string | null;              // decedent's SSN / estate EIN
  personalRepresentative: string;   // executor or administrator
  attorney: string | null;
  probateCourtCaseNumber: string | null;
  estateStatus: EstateStatus;
  openedAt: string;
  closedAt: string | null;
  notes: string;
}

export interface EstateAsset {
  assetId: string;
  caseId: string;
  description: string;
  assetType: EstateAssetType;
  dispositionMethod: DispositionMethod;
  dateOfDeathValue: string;
  currentAppraisedValue: string;
  appraisalDate: string | null;
  location: string | null;
  beneficiary: string | null;        // who inherits this asset
  stepUpInBasis: string | null;      // IRC §1014 stepped-up cost basis
  notes: string;
}

export interface CreditorClaim {
  claimId: string;
  caseId: string;
  creditorName: string;
  claimAmount: string;
  claimType: 'SECURED' | 'UNSECURED' | 'PRIORITY' | 'ADMINISTRATIVE';
  claimStatus: 'FILED' | 'ALLOWED' | 'DISPUTED' | 'REJECTED' | 'PAID';
  filedDate: string;
  dueDate: string;
  allowedAmount: string | null;
  paidDate: string | null;
  notes: string;
}

export interface EstateDistribution {
  estateDistributionId: string;
  caseId: string;
  beneficiaryName: string;
  assetDescription: string;
  amount: string;
  distributionDate: string;
  taxBasis: string;                  // stepped-up or carryover basis
  notes: string;
}

// ── In-memory stores ──────────────────────────────────────────────────────────

const trustStore        = new Map<string, Trust>();
const partyStore        = new Map<string, TrustParty>();
const distributionStore = new Map<string, TrustDistribution>();
const accountingStore   = new Map<string, TrustAccountingPeriod>();
const amendmentStore    = new Map<string, TrustAmendment>();

const estateStore            = new Map<string, EstateCase>();
const estateAssetStore       = new Map<string, EstateAsset>();
const creditorStore          = new Map<string, CreditorClaim>();
const estateDistributionStore = new Map<string, EstateDistribution>();

// ── Helpers ───────────────────────────────────────────────────────────────────

function requireTrustStatus(trust: Trust, ...allowed: TrustStatus[]): void {
  if (!allowed.includes(trust.status)) {
    throw new BadRequestException(
      `Trust ${trust.trustId} must be in status [${allowed.join('|')}] (currently ${trust.status})`,
    );
  }
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class TrustEstateService {
  private readonly logger = new Logger(TrustEstateService.name);

  // ── Trust creation & lifecycle ────────────────────────────────────────────

  createTrust(params: {
    trustName: string;
    trustType: TrustType;
    jurisdiction: string;
    taxId?: string;
    documentRef?: string;
    adminNotes?: string;
  }): Trust {
    const trust: Trust = {
      trustId:           uuidv4(),
      trustName:         params.trustName,
      trustType:         params.trustType,
      status:            'DRAFT',
      jurisdiction:      params.jurisdiction,
      taxId:             params.taxId ?? null,
      principalBalance:  '0.00',
      incomeBalance:     '0.00',
      inceptionDate:     null,
      terminationDate:   null,
      documentRef:       params.documentRef ?? null,
      lastAmendmentDate: null,
      adminNotes:        params.adminNotes ?? '',
      parties:           [],
      beneficiaries:     [],
    };
    trustStore.set(trust.trustId, trust);
    this.logger.log(`Created trust ${trust.trustId} (${trust.trustType}) "${trust.trustName}"`);
    return trust;
  }

  executeTrust(trustId: string): Trust {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'DRAFT');
    trust.status      = 'EXECUTED';
    trust.inceptionDate = new Date().toISOString().split('T')[0]!;
    trustStore.set(trustId, trust);
    this.logger.log(`Trust ${trustId} executed`);
    return trust;
  }

  activateTrust(trustId: string): Trust {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'EXECUTED');
    trust.status = 'ACTIVE';
    trustStore.set(trustId, trust);
    this.logger.log(`Trust ${trustId} activated`);
    return trust;
  }

  amendTrust(trustId: string, params: {
    description: string;
    recordedBy: string;
    documentRef?: string;
  }): TrustAmendment {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'ACTIVE', 'AMENDMENT_IN_PROGRESS');

    trust.status            = 'AMENDMENT_IN_PROGRESS';
    trust.lastAmendmentDate = new Date().toISOString().split('T')[0]!;
    trustStore.set(trustId, trust);

    const amendment: TrustAmendment = {
      amendmentId:   uuidv4(),
      trustId,
      amendmentDate: trust.lastAmendmentDate,
      description:   params.description,
      recordedBy:    params.recordedBy,
      documentRef:   params.documentRef ?? null,
    };
    amendmentStore.set(amendment.amendmentId, amendment);

    // Re-activate after amendment is recorded
    trust.status = 'ACTIVE';
    trustStore.set(trustId, trust);

    return amendment;
  }

  terminateTrust(trustId: string): Trust {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'ACTIVE', 'AMENDMENT_IN_PROGRESS');

    // Cannot terminate if there are undistributed balances > $0
    const principal = new Decimal(trust.principalBalance);
    const income    = new Decimal(trust.incomeBalance);
    if (principal.plus(income).gt(0)) {
      throw new BadRequestException(
        `Trust has undistributed balances (principal ${trust.principalBalance}, income ${trust.incomeBalance}). ` +
        'Distribute all funds before terminating.',
      );
    }

    trust.status          = 'TERMINATED';
    trust.terminationDate = new Date().toISOString().split('T')[0]!;
    trustStore.set(trustId, trust);
    this.logger.log(`Trust ${trustId} terminated`);
    return trust;
  }

  getTrust(trustId: string): Trust {
    const t = trustStore.get(trustId);
    if (!t) throw new NotFoundException(`Trust ${trustId} not found`);
    return t;
  }

  listTrusts(status?: TrustStatus): Trust[] {
    const all = [...trustStore.values()];
    return status ? all.filter((t) => t.status === status) : all;
  }

  // ── Trust parties ─────────────────────────────────────────────────────────

  addTrustParty(trustId: string, params: {
    role: TrusteeRole;
    name: string;
    taxId?: string;
    email?: string;
    phone?: string;
    notes?: string;
  }): TrustParty {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'DRAFT', 'EXECUTED', 'ACTIVE', 'AMENDMENT_IN_PROGRESS');

    const party: TrustParty = {
      partyId:       uuidv4(),
      trustId,
      role:          params.role,
      name:          params.name,
      taxId:         params.taxId ?? null,
      email:         params.email ?? null,
      phone:         params.phone ?? null,
      effectiveDate: new Date().toISOString().split('T')[0]!,
      endDate:       null,
      notes:         params.notes ?? '',
    };
    partyStore.set(party.partyId, party);

    trust.parties.push(party);
    trustStore.set(trustId, trust);
    return party;
  }

  // ── Beneficiaries ─────────────────────────────────────────────────────────

  addTrustBeneficiary(trustId: string, params: {
    name: string;
    taxId?: string;
    distributionClass: TrustDistributionClass;
    distributionStandard: DistributionStandard;
    distributionPct?: string;
    unitrustPct?: string;
    charitableAnnuityAmount?: string;
    ageOfDistribution?: number;
    isCharitable?: boolean;
    notes?: string;
  }): TrustBeneficiary {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'DRAFT', 'EXECUTED', 'ACTIVE', 'AMENDMENT_IN_PROGRESS');

    const bene: TrustBeneficiary = {
      beneficiaryId:           uuidv4(),
      trustId,
      name:                    params.name,
      taxId:                   params.taxId ?? null,
      distributionClass:       params.distributionClass,
      distributionStandard:    params.distributionStandard,
      distributionPct:         params.distributionPct ?? null,
      unitrustPct:             params.unitrustPct ?? null,
      charitableAnnuityAmount: params.charitableAnnuityAmount ?? null,
      ageOfDistribution:       params.ageOfDistribution ?? null,
      isCharitable:            params.isCharitable ?? false,
      totalDistributions:      '0.00',
      notes:                   params.notes ?? '',
    };

    trust.beneficiaries.push(bene);
    trustStore.set(trustId, trust);
    return bene;
  }

  // ── Distributions ─────────────────────────────────────────────────────────

  makeDistribution(trustId: string, params: {
    beneficiaryId: string;
    amount: string;
    distributionClass: TrustDistributionClass;
    standard: DistributionStandard;
    taxWithheld?: string;
    taxCategory?: TrustDistribution['taxCategory'];
    approvedBy: string;
    notes?: string;
  }): TrustDistribution {
    const trust = this.getTrust(trustId);
    requireTrustStatus(trust, 'ACTIVE');

    const bene = trust.beneficiaries.find((b) => b.beneficiaryId === params.beneficiaryId);
    if (!bene) {
      throw new NotFoundException(`Beneficiary ${params.beneficiaryId} not found in trust ${trustId}`);
    }

    const amount = new Decimal(params.amount);
    if (amount.lte(0)) throw new BadRequestException('Distribution amount must be positive');

    // Deduct from appropriate balance
    if (params.distributionClass === 'INCOME' || params.distributionClass === 'BOTH') {
      const incomeBal = new Decimal(trust.incomeBalance);
      const incomeDistrib = params.distributionClass === 'BOTH' ? amount.dividedBy(2) : amount;
      if (incomeDistrib.gt(incomeBal)) {
        throw new BadRequestException(
          `Insufficient income balance: requested ${incomeDistrib.toFixed(2)}, available ${trust.incomeBalance}`,
        );
      }
      trust.incomeBalance = incomeBal.minus(incomeDistrib).toFixed(2);
    }
    if (params.distributionClass === 'PRINCIPAL' || params.distributionClass === 'BOTH') {
      const principalBal = new Decimal(trust.principalBalance);
      const principalDistrib = params.distributionClass === 'BOTH' ? amount.dividedBy(2) : amount;
      if (principalDistrib.gt(principalBal)) {
        throw new BadRequestException(
          `Insufficient principal balance: requested ${principalDistrib.toFixed(2)}, available ${trust.principalBalance}`,
        );
      }
      trust.principalBalance = principalBal.minus(principalDistrib).toFixed(2);
    }

    bene.totalDistributions = new Decimal(bene.totalDistributions).plus(amount).toFixed(2);
    trustStore.set(trustId, trust);

    const dist: TrustDistribution = {
      distributionId:    uuidv4(),
      trustId,
      beneficiaryId:     params.beneficiaryId,
      beneficiaryName:   bene.name,
      amount:            amount.toFixed(2),
      distributionClass: params.distributionClass,
      standard:          params.standard,
      distributionDate:  new Date().toISOString().split('T')[0]!,
      taxWithheld:       params.taxWithheld ?? '0.00',
      taxCategory:       params.taxCategory ?? 'ORDINARY_INCOME',
      checkRef:          `CHK-${Date.now()}`,
      approvedBy:        params.approvedBy,
      notes:             params.notes ?? '',
    };
    distributionStore.set(dist.distributionId, dist);

    this.logger.log(
      `Trust ${trustId}: distributed $${amount.toFixed(2)} (${params.distributionClass}) to ${bene.name}`,
    );
    return dist;
  }

  listDistributions(trustId: string): TrustDistribution[] {
    return [...distributionStore.values()].filter((d) => d.trustId === trustId);
  }

  // ── Trust accounting ──────────────────────────────────────────────────────

  recordAccountingPeriod(trustId: string, params: {
    startDate: string;
    endDate: string;
    openingPrincipal: string;
    openingIncome: string;
    investmentIncome: string;
    capitalGains: string;
    trustExpenses: string;
    taxesWithheld: string;
  }): TrustAccountingPeriod {
    const trust = this.getTrust(trustId);

    const openPrincipal  = new Decimal(params.openingPrincipal);
    const openIncome     = new Decimal(params.openingIncome);
    const invIncome      = new Decimal(params.investmentIncome);
    const capGains       = new Decimal(params.capitalGains);
    const expenses       = new Decimal(params.trustExpenses);
    const taxes          = new Decimal(params.taxesWithheld);

    // Get distributions in period
    const periodDists = [...distributionStore.values()].filter(
      (d) => d.trustId === trustId
        && d.distributionDate >= params.startDate
        && d.distributionDate <= params.endDate,
    );
    const distIncome    = periodDists
      .filter((d) => d.distributionClass === 'INCOME' || d.distributionClass === 'BOTH')
      .reduce((sum, d) => sum.plus(new Decimal(d.amount)), new Decimal(0));
    const distPrincipal = periodDists
      .filter((d) => d.distributionClass === 'PRINCIPAL' || d.distributionClass === 'BOTH')
      .reduce((sum, d) => sum.plus(new Decimal(d.amount)), new Decimal(0));

    // Closing balances
    const closingIncome = openIncome
      .plus(invIncome)
      .minus(expenses)
      .minus(taxes)
      .minus(distIncome);
    const closingPrincipal = openPrincipal
      .plus(capGains)
      .minus(distPrincipal);

    // Update trust balances
    trust.principalBalance = closingPrincipal.toFixed(2);
    trust.incomeBalance    = closingIncome.toFixed(2);
    trustStore.set(trustId, trust);

    const period: TrustAccountingPeriod = {
      periodId:                uuidv4(),
      trustId,
      startDate:               params.startDate,
      endDate:                 params.endDate,
      openingPrincipal:        openPrincipal.toFixed(2),
      openingIncome:           openIncome.toFixed(2),
      investmentIncome:        invIncome.toFixed(2),
      capitalGains:            capGains.toFixed(2),
      trustExpenses:           expenses.toFixed(2),
      taxesWithheld:           taxes.toFixed(2),
      distributionsToIncome:   distIncome.toFixed(2),
      distributionsToPrincipal: distPrincipal.toFixed(2),
      closingPrincipal:        closingPrincipal.toFixed(2),
      closingIncome:           closingIncome.toFixed(2),
      netInvestmentIncome:     invIncome.plus(capGains).minus(expenses).toFixed(2),
    };
    accountingStore.set(period.periodId, period);
    return period;
  }

  getTrustAccounting(trustId: string): TrustAccountingPeriod[] {
    this.getTrust(trustId);
    return [...accountingStore.values()]
      .filter((p) => p.trustId === trustId)
      .sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  // ── Estate settlement ─────────────────────────────────────────────────────

  createEstateCase(params: {
    decedentName: string;
    dateOfDeath: string;
    jurisdiction: string;
    taxId?: string;
    personalRepresentative: string;
    attorney?: string;
    probateCourtCaseNumber?: string;
    notes?: string;
  }): EstateCase {
    const estate: EstateCase = {
      caseId:                  uuidv4(),
      decedentName:            params.decedentName,
      dateOfDeath:             params.dateOfDeath,
      jurisdiction:            params.jurisdiction,
      taxId:                   params.taxId ?? null,
      personalRepresentative:  params.personalRepresentative,
      attorney:                params.attorney ?? null,
      probateCourtCaseNumber:  params.probateCourtCaseNumber ?? null,
      estateStatus:            'OPEN',
      openedAt:                new Date().toISOString(),
      closedAt:                null,
      notes:                   params.notes ?? '',
    };
    estateStore.set(estate.caseId, estate);
    this.logger.log(`Estate case ${estate.caseId} opened for ${estate.decedentName} (DOD: ${estate.dateOfDeath})`);
    return estate;
  }

  getEstateCase(caseId: string): EstateCase {
    const e = estateStore.get(caseId);
    if (!e) throw new NotFoundException(`Estate case ${caseId} not found`);
    return e;
  }

  advanceEstateStatus(caseId: string, newStatus: EstateStatus): EstateCase {
    const estate = this.getEstateCase(caseId);
    const validTransitions: Record<EstateStatus, EstateStatus[]> = {
      OPEN:                      ['PROBATE_IN_PROGRESS'],
      PROBATE_IN_PROGRESS:       ['CREDITOR_NOTICE_PERIOD'],
      CREDITOR_NOTICE_PERIOD:    ['ASSETS_INVENTORIED'],
      ASSETS_INVENTORIED:        ['DISTRIBUTION_IN_PROGRESS'],
      DISTRIBUTION_IN_PROGRESS:  ['CLOSED'],
      CLOSED:                    [],
    };

    if (!validTransitions[estate.estateStatus].includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition estate from ${estate.estateStatus} to ${newStatus}`,
      );
    }

    estate.estateStatus = newStatus;
    if (newStatus === 'CLOSED') estate.closedAt = new Date().toISOString();
    estateStore.set(caseId, estate);
    return estate;
  }

  addEstateAsset(caseId: string, params: {
    description: string;
    assetType: EstateAssetType;
    dispositionMethod: DispositionMethod;
    dateOfDeathValue: string;
    currentAppraisedValue?: string;
    appraisalDate?: string;
    location?: string;
    beneficiary?: string;
    notes?: string;
  }): EstateAsset {
    this.getEstateCase(caseId);

    const dodValue = new Decimal(params.dateOfDeathValue);
    // IRC §1014: stepped-up basis = fair market value at date of death
    const stepUpBasis = dodValue.toFixed(2);

    const asset: EstateAsset = {
      assetId:               uuidv4(),
      caseId,
      description:           params.description,
      assetType:             params.assetType,
      dispositionMethod:     params.dispositionMethod,
      dateOfDeathValue:      dodValue.toFixed(2),
      currentAppraisedValue: params.currentAppraisedValue ?? dodValue.toFixed(2),
      appraisalDate:         params.appraisalDate ?? null,
      location:              params.location ?? null,
      beneficiary:           params.beneficiary ?? null,
      stepUpInBasis:         stepUpBasis,
      notes:                 params.notes ?? '',
    };
    estateAssetStore.set(asset.assetId, asset);
    return asset;
  }

  fileCreditorClaim(caseId: string, params: {
    creditorName: string;
    claimAmount: string;
    claimType: CreditorClaim['claimType'];
    dueDate: string;
    notes?: string;
  }): CreditorClaim {
    this.getEstateCase(caseId);

    const claim: CreditorClaim = {
      claimId:       uuidv4(),
      caseId,
      creditorName:  params.creditorName,
      claimAmount:   new Decimal(params.claimAmount).toFixed(2),
      claimType:     params.claimType,
      claimStatus:   'FILED',
      filedDate:     new Date().toISOString().split('T')[0]!,
      dueDate:       params.dueDate,
      allowedAmount: null,
      paidDate:      null,
      notes:         params.notes ?? '',
    };
    creditorStore.set(claim.claimId, claim);
    return claim;
  }

  updateCreditorClaim(claimId: string, params: {
    claimStatus: CreditorClaim['claimStatus'];
    allowedAmount?: string;
  }): CreditorClaim {
    const claim = creditorStore.get(claimId);
    if (!claim) throw new NotFoundException(`Creditor claim ${claimId} not found`);
    claim.claimStatus   = params.claimStatus;
    claim.allowedAmount = params.allowedAmount ?? claim.allowedAmount;
    if (params.claimStatus === 'PAID') claim.paidDate = new Date().toISOString().split('T')[0]!;
    creditorStore.set(claimId, claim);
    return claim;
  }

  recordEstateDistribution(caseId: string, params: {
    beneficiaryName: string;
    assetDescription: string;
    amount: string;
    taxBasis: string;
    notes?: string;
  }): EstateDistribution {
    this.getEstateCase(caseId);

    const dist: EstateDistribution = {
      estateDistributionId: uuidv4(),
      caseId,
      beneficiaryName:   params.beneficiaryName,
      assetDescription:  params.assetDescription,
      amount:            new Decimal(params.amount).toFixed(2),
      distributionDate:  new Date().toISOString().split('T')[0]!,
      taxBasis:          new Decimal(params.taxBasis).toFixed(2),
      notes:             params.notes ?? '',
    };
    estateDistributionStore.set(dist.estateDistributionId, dist);
    return dist;
  }

  getEstateSummary(caseId: string): {
    estate: EstateCase;
    assets: EstateAsset[];
    grossEstateValue: string;
    creditorClaims: CreditorClaim[];
    totalAllowedClaims: string;
    totalPaidClaims: string;
    estimatedNetEstate: string;
    distributions: EstateDistribution[];
    totalDistributed: string;
  } {
    const estate    = this.getEstateCase(caseId);
    const assets    = [...estateAssetStore.values()].filter((a) => a.caseId === caseId);
    const claims    = [...creditorStore.values()].filter((c) => c.caseId === caseId);
    const dists     = [...estateDistributionStore.values()].filter((d) => d.caseId === caseId);

    const grossEstate = assets.reduce(
      (sum, a) => sum.plus(new Decimal(a.currentAppraisedValue)), new Decimal(0),
    );
    const totalAllowed = claims
      .filter((c) => c.claimStatus === 'ALLOWED' || c.claimStatus === 'PAID')
      .reduce((sum, c) => sum.plus(new Decimal(c.allowedAmount ?? c.claimAmount)), new Decimal(0));
    const totalPaid = claims
      .filter((c) => c.claimStatus === 'PAID')
      .reduce((sum, c) => sum.plus(new Decimal(c.allowedAmount ?? c.claimAmount)), new Decimal(0));
    const netEstate = grossEstate.minus(totalAllowed);
    const totalDistributed = dists.reduce(
      (sum, d) => sum.plus(new Decimal(d.amount)), new Decimal(0),
    );

    return {
      estate,
      assets,
      grossEstateValue:    grossEstate.toFixed(2),
      creditorClaims:      claims,
      totalAllowedClaims:  totalAllowed.toFixed(2),
      totalPaidClaims:     totalPaid.toFixed(2),
      estimatedNetEstate:  netEstate.toFixed(2),
      distributions:       dists,
      totalDistributed:    totalDistributed.toFixed(2),
    };
  }
}
