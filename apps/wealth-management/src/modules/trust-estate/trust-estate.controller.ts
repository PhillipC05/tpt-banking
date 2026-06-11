import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  TrustEstateService,
  TrustType,
  TrustStatus,
  TrusteeRole,
  TrustDistributionClass,
  DistributionStandard,
  EstateAssetType,
  DispositionMethod,
  EstateStatus,
  CreditorClaim,
} from './trust-estate.service';

@ApiTags('Trust & Estate')
@ApiBearerAuth('access-token')
@Controller('trust-estate')
export class TrustEstateController {
  constructor(private readonly svc: TrustEstateService) {}

  // ── Trusts: lifecycle ─────────────────────────────────────────────────────

  @Post('trusts')
  @ApiOperation({ summary: 'Create a new trust instrument (starts in DRAFT status)' })
  createTrust(
    @Body() body: {
      trustName: string;
      trustType: TrustType;
      jurisdiction: string;
      taxId?: string;
      documentRef?: string;
      adminNotes?: string;
    },
  ) {
    return this.svc.createTrust(body);
  }

  @Get('trusts')
  @ApiOperation({ summary: 'List trusts, optionally filtered by status' })
  @ApiQuery({ name: 'status', required: false })
  listTrusts(@Query('status') status?: TrustStatus) {
    return this.svc.listTrusts(status);
  }

  @Get('trusts/:trustId')
  @ApiOperation({ summary: 'Get a trust with all parties, beneficiaries, and balances' })
  getTrust(@Param('trustId') trustId: string) {
    return this.svc.getTrust(trustId);
  }

  @Post('trusts/:trustId/execute')
  @ApiOperation({ summary: 'Execute a draft trust — sets inception date and transitions to EXECUTED' })
  executeTrust(@Param('trustId') trustId: string) {
    return this.svc.executeTrust(trustId);
  }

  @Post('trusts/:trustId/activate')
  @ApiOperation({ summary: 'Activate an executed trust — trust can now receive assets and make distributions' })
  activateTrust(@Param('trustId') trustId: string) {
    return this.svc.activateTrust(trustId);
  }

  @Post('trusts/:trustId/amend')
  @ApiOperation({ summary: 'Record a trust amendment (revocable trusts only)' })
  amendTrust(
    @Param('trustId') trustId: string,
    @Body() body: { description: string; recordedBy: string; documentRef?: string },
  ) {
    return this.svc.amendTrust(trustId, body);
  }

  @Post('trusts/:trustId/terminate')
  @ApiOperation({ summary: 'Terminate a trust (requires zero balances — distribute all funds first)' })
  terminateTrust(@Param('trustId') trustId: string) {
    return this.svc.terminateTrust(trustId);
  }

  // ── Trusts: parties & beneficiaries ──────────────────────────────────────

  @Post('trusts/:trustId/parties')
  @ApiOperation({ summary: 'Add a trustee, grantor, protector, or other party to a trust' })
  addParty(
    @Param('trustId') trustId: string,
    @Body() body: {
      role: TrusteeRole;
      name: string;
      taxId?: string;
      email?: string;
      phone?: string;
      notes?: string;
    },
  ) {
    return this.svc.addTrustParty(trustId, body);
  }

  @Post('trusts/:trustId/beneficiaries')
  @ApiOperation({ summary: 'Add a beneficiary with distribution class, standard (HEMS, mandatory, unitrust, etc.)' })
  addBeneficiary(
    @Param('trustId') trustId: string,
    @Body() body: {
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
    },
  ) {
    return this.svc.addTrustBeneficiary(trustId, body);
  }

  // ── Trusts: distributions & accounting ───────────────────────────────────

  @Post('trusts/:trustId/distributions')
  @ApiOperation({ summary: 'Make a distribution from trust income or principal to a beneficiary' })
  makeDistribution(
    @Param('trustId') trustId: string,
    @Body() body: {
      beneficiaryId: string;
      amount: string;
      distributionClass: TrustDistributionClass;
      standard: DistributionStandard;
      taxWithheld?: string;
      taxCategory?: 'ORDINARY_INCOME' | 'QUALIFIED_DIVIDEND' | 'CAPITAL_GAIN' | 'RETURN_OF_PRINCIPAL' | 'TAX_EXEMPT';
      approvedBy: string;
      notes?: string;
    },
  ) {
    return this.svc.makeDistribution(trustId, body);
  }

  @Get('trusts/:trustId/distributions')
  @ApiOperation({ summary: 'List all distributions from a trust' })
  listDistributions(@Param('trustId') trustId: string) {
    return this.svc.listDistributions(trustId);
  }

  @Post('trusts/:trustId/accounting')
  @ApiOperation({ summary: 'Record a trust accounting period (updates principal/income balances)' })
  recordAccounting(
    @Param('trustId') trustId: string,
    @Body() body: {
      startDate: string;
      endDate: string;
      openingPrincipal: string;
      openingIncome: string;
      investmentIncome: string;
      capitalGains: string;
      trustExpenses: string;
      taxesWithheld: string;
    },
  ) {
    return this.svc.recordAccountingPeriod(trustId, body);
  }

  @Get('trusts/:trustId/accounting')
  @ApiOperation({ summary: 'Get trust accounting history (all periods, sorted by date)' })
  getAccounting(@Param('trustId') trustId: string) {
    return this.svc.getTrustAccounting(trustId);
  }

  // ── Estate settlement ─────────────────────────────────────────────────────

  @Post('estates')
  @ApiOperation({ summary: 'Open a new estate administration case' })
  createEstate(
    @Body() body: {
      decedentName: string;
      dateOfDeath: string;
      jurisdiction: string;
      taxId?: string;
      personalRepresentative: string;
      attorney?: string;
      probateCourtCaseNumber?: string;
      notes?: string;
    },
  ) {
    return this.svc.createEstateCase(body);
  }

  @Get('estates/:caseId')
  @ApiOperation({ summary: 'Get an estate case' })
  getEstate(@Param('caseId') caseId: string) {
    return this.svc.getEstateCase(caseId);
  }

  @Patch('estates/:caseId/status')
  @ApiOperation({ summary: 'Advance estate workflow status (OPEN → PROBATE → CREDITOR NOTICE → INVENTORY → DISTRIBUTION → CLOSED)' })
  advanceStatus(
    @Param('caseId') caseId: string,
    @Body() body: { status: EstateStatus },
  ) {
    return this.svc.advanceEstateStatus(caseId, body.status);
  }

  @Post('estates/:caseId/assets')
  @ApiOperation({ summary: 'Add an asset to the estate inventory (IRC §1014 stepped-up basis calculated automatically)' })
  addAsset(
    @Param('caseId') caseId: string,
    @Body() body: {
      description: string;
      assetType: EstateAssetType;
      dispositionMethod: DispositionMethod;
      dateOfDeathValue: string;
      currentAppraisedValue?: string;
      appraisalDate?: string;
      location?: string;
      beneficiary?: string;
      notes?: string;
    },
  ) {
    return this.svc.addEstateAsset(caseId, body);
  }

  @Post('estates/:caseId/creditors')
  @ApiOperation({ summary: 'File a creditor claim against the estate' })
  fileCreditorClaim(
    @Param('caseId') caseId: string,
    @Body() body: {
      creditorName: string;
      claimAmount: string;
      claimType: CreditorClaim['claimType'];
      dueDate: string;
      notes?: string;
    },
  ) {
    return this.svc.fileCreditorClaim(caseId, body);
  }

  @Patch('estates/claims/:claimId')
  @ApiOperation({ summary: 'Update creditor claim status (allow, dispute, reject, or mark paid)' })
  updateClaim(
    @Param('claimId') claimId: string,
    @Body() body: { claimStatus: CreditorClaim['claimStatus']; allowedAmount?: string },
  ) {
    return this.svc.updateCreditorClaim(claimId, body);
  }

  @Post('estates/:caseId/distributions')
  @ApiOperation({ summary: 'Record an estate distribution to a beneficiary' })
  recordDistribution(
    @Param('caseId') caseId: string,
    @Body() body: {
      beneficiaryName: string;
      assetDescription: string;
      amount: string;
      taxBasis: string;
      notes?: string;
    },
  ) {
    return this.svc.recordEstateDistribution(caseId, body);
  }

  @Get('estates/:caseId/summary')
  @ApiOperation({ summary: 'Full estate summary: assets, gross/net estate value, creditor claims, distributions' })
  getEstateSummary(@Param('caseId') caseId: string) {
    return this.svc.getEstateSummary(caseId);
  }
}
