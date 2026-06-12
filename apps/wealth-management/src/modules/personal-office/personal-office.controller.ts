import {
  Controller, Get, Post, Patch, Delete, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  PersonalOfficeService,
  AssetCategory,
  LiabilityCategory,
  GoalType,
  GoalStatus,
  RiskTolerance,
  EsgPreference,
  BeneficiaryDesignation,
  PersonalDocumentType,
} from './personal-office.service';

@ApiTags('Personal Office')
@ApiBearerAuth('access-token')
@Controller('personal-office')
export class PersonalOfficeController {
  constructor(private readonly svc: PersonalOfficeService) {}

  // ── Profile ──────────────────────────────────────────────────────────────────

  @Post('profiles')
  @ApiOperation({ summary: 'Create a personal family office profile (idempotent — one per customerId)' })
  createProfile(
    @Body() body: { customerId: string; householdName: string },
  ) {
    return this.svc.createProfile(body.customerId, { householdName: body.householdName });
  }

  @Get('profiles')
  @ApiOperation({ summary: 'Get personal office profile by customerId' })
  @ApiQuery({ name: 'customerId', required: true })
  getProfile(@Query('customerId') customerId: string) {
    return this.svc.getProfile(customerId);
  }

  // ── Dashboard ─────────────────────────────────────────────────────────────────

  @Get('dashboard')
  @ApiOperation({ summary: 'Full personal dashboard: net worth, goals, IPS, beneficiaries, vault summary' })
  @ApiQuery({ name: 'customerId', required: true })
  getDashboard(@Query('customerId') customerId: string) {
    return this.svc.getDashboard(customerId);
  }

  // ── Net Worth: Assets ─────────────────────────────────────────────────────────

  @Post('assets')
  @ApiOperation({ summary: 'Add a personal asset (real estate, investment, vehicle, crypto, etc.)' })
  addAsset(
    @Body() body: {
      customerId: string;
      name: string;
      category: AssetCategory;
      value: string;
      currency: string;
      description?: string;
    },
  ) {
    const { customerId, ...rest } = body;
    return this.svc.addAsset(customerId, rest);
  }

  @Get('assets')
  @ApiOperation({ summary: 'List all assets for a customer' })
  @ApiQuery({ name: 'customerId', required: true })
  listAssets(@Query('customerId') customerId: string) {
    return this.svc.listAssets(customerId);
  }

  @Patch('assets/:assetId')
  @ApiOperation({ summary: 'Update an asset value, name, or description' })
  updateAsset(
    @Query('customerId') customerId: string,
    @Param('assetId') assetId: string,
    @Body() body: { value?: string; name?: string; description?: string },
  ) {
    return this.svc.updateAsset(customerId, assetId, body);
  }

  @Delete('assets/:assetId')
  @ApiOperation({ summary: 'Remove an asset' })
  removeAsset(
    @Query('customerId') customerId: string,
    @Param('assetId') assetId: string,
  ) {
    return this.svc.removeAsset(customerId, assetId);
  }

  // ── Net Worth: Liabilities ────────────────────────────────────────────────────

  @Post('liabilities')
  @ApiOperation({ summary: 'Add a personal liability (mortgage, car loan, student debt, etc.)' })
  addLiability(
    @Body() body: {
      customerId: string;
      name: string;
      category: LiabilityCategory;
      balance: string;
      currency: string;
      interestRate?: number;
      minimumPayment?: string;
    },
  ) {
    const { customerId, ...rest } = body;
    return this.svc.addLiability(customerId, rest);
  }

  @Get('liabilities')
  @ApiOperation({ summary: 'List all liabilities for a customer' })
  @ApiQuery({ name: 'customerId', required: true })
  listLiabilities(@Query('customerId') customerId: string) {
    return this.svc.listLiabilities(customerId);
  }

  @Patch('liabilities/:liabilityId')
  @ApiOperation({ summary: 'Update a liability balance, interest rate, or minimum payment' })
  updateLiability(
    @Query('customerId') customerId: string,
    @Param('liabilityId') liabilityId: string,
    @Body() body: { balance?: string; interestRate?: number; minimumPayment?: string; name?: string },
  ) {
    return this.svc.updateLiability(customerId, liabilityId, body);
  }

  @Delete('liabilities/:liabilityId')
  @ApiOperation({ summary: 'Remove a liability' })
  removeLiability(
    @Query('customerId') customerId: string,
    @Param('liabilityId') liabilityId: string,
  ) {
    return this.svc.removeLiability(customerId, liabilityId);
  }

  // ── Net Worth Summary ─────────────────────────────────────────────────────────

  @Get('net-worth')
  @ApiOperation({ summary: 'Get net worth: total assets − total liabilities, broken down by category' })
  @ApiQuery({ name: 'customerId', required: true })
  getNetWorth(@Query('customerId') customerId: string) {
    return this.svc.getNetWorth(customerId);
  }

  // ── Financial Goals ───────────────────────────────────────────────────────────

  @Post('goals')
  @ApiOperation({ summary: 'Create a financial goal (retirement, college fund, home purchase, etc.)' })
  createGoal(
    @Body() body: {
      customerId: string;
      name: string;
      goalType: GoalType;
      targetAmount: string;
      currentAmount: string;
      currency: string;
      targetDate: string;
      monthlyContribution: string;
    },
  ) {
    const { customerId, ...rest } = body;
    return this.svc.createGoal(customerId, rest);
  }

  @Get('goals')
  @ApiOperation({ summary: 'List all financial goals with live status' })
  @ApiQuery({ name: 'customerId', required: true })
  listGoals(@Query('customerId') customerId: string) {
    return this.svc.listGoals(customerId);
  }

  @Get('goals/:goalId')
  @ApiOperation({ summary: 'Get a goal with projected months-to-target and projected completion date' })
  @ApiQuery({ name: 'customerId', required: true })
  getGoal(
    @Query('customerId') customerId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.svc.getGoal(customerId, goalId);
  }

  @Patch('goals/:goalId')
  @ApiOperation({ summary: 'Update goal: current amount, monthly contribution, target date, or pause/resume' })
  updateGoal(
    @Query('customerId') customerId: string,
    @Param('goalId') goalId: string,
    @Body() body: {
      name?: string;
      currentAmount?: string;
      monthlyContribution?: string;
      targetDate?: string;
      status?: GoalStatus;
    },
  ) {
    return this.svc.updateGoal(customerId, goalId, body);
  }

  @Delete('goals/:goalId')
  @ApiOperation({ summary: 'Remove a financial goal' })
  removeGoal(
    @Query('customerId') customerId: string,
    @Param('goalId') goalId: string,
  ) {
    return this.svc.removeGoal(customerId, goalId);
  }

  // ── Personal IPS ──────────────────────────────────────────────────────────────

  @Post('ips')
  @ApiOperation({ summary: 'Create or replace personal Investment Policy Statement (risk tolerance, allocation, ESG)' })
  setIPS(
    @Body() body: {
      customerId: string;
      riskTolerance: RiskTolerance;
      investmentHorizonYears: number;
      targetAllocation: Record<string, number>;
      maxDrawdownPct: number;
      esgPreferences: EsgPreference[];
    },
  ) {
    const { customerId, ...rest } = body;
    return this.svc.setIPS(customerId, rest);
  }

  @Get('ips')
  @ApiOperation({ summary: 'Get current personal IPS' })
  @ApiQuery({ name: 'customerId', required: true })
  getIPS(@Query('customerId') customerId: string) {
    return this.svc.getIPS(customerId);
  }

  // ── Beneficiaries ─────────────────────────────────────────────────────────────

  @Post('beneficiaries')
  @ApiOperation({ summary: 'Register a beneficiary (PRIMARY, CONTINGENT, or TERTIARY designation)' })
  addBeneficiary(
    @Body() body: {
      customerId: string;
      name: string;
      relationship: string;
      designation: BeneficiaryDesignation;
      allocationPct: number;
      email?: string;
      phone?: string;
      accountIds?: string[];
    },
  ) {
    const { customerId, ...rest } = body;
    return this.svc.addBeneficiary(customerId, rest);
  }

  @Get('beneficiaries')
  @ApiOperation({ summary: 'List all beneficiaries' })
  @ApiQuery({ name: 'customerId', required: true })
  listBeneficiaries(@Query('customerId') customerId: string) {
    return this.svc.listBeneficiaries(customerId);
  }

  @Patch('beneficiaries/:beneficiaryId')
  @ApiOperation({ summary: 'Update a beneficiary' })
  updateBeneficiary(
    @Query('customerId') customerId: string,
    @Param('beneficiaryId') beneficiaryId: string,
    @Body() body: {
      name?: string;
      relationship?: string;
      allocationPct?: number;
      email?: string;
      phone?: string;
      accountIds?: string[];
    },
  ) {
    return this.svc.updateBeneficiary(customerId, beneficiaryId, body);
  }

  @Delete('beneficiaries/:beneficiaryId')
  @ApiOperation({ summary: 'Remove a beneficiary' })
  removeBeneficiary(
    @Query('customerId') customerId: string,
    @Param('beneficiaryId') beneficiaryId: string,
  ) {
    return this.svc.removeBeneficiary(customerId, beneficiaryId);
  }

  // ── Document Vault ────────────────────────────────────────────────────────────

  @Post('documents')
  @ApiOperation({ summary: 'Store a document in the encrypted vault (will, insurance, tax return, deed, etc.)' })
  storeDocument(
    @Body() body: { customerId: string; documentType: PersonalDocumentType; name: string; description?: string },
  ) {
    const { customerId, ...rest } = body;
    return this.svc.storeDocument(customerId, rest);
  }

  @Get('documents')
  @ApiOperation({ summary: 'List vault documents (metadata only)' })
  @ApiQuery({ name: 'customerId', required: true })
  listDocuments(@Query('customerId') customerId: string) {
    return this.svc.listDocuments(customerId);
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: 'Get a document with full metadata and access audit log' })
  @ApiQuery({ name: 'customerId', required: true })
  getDocument(
    @Query('customerId') customerId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.svc.getDocument(customerId, documentId);
  }

  @Delete('documents/:documentId')
  @ApiOperation({ summary: 'Remove a document from the vault' })
  removeDocument(
    @Query('customerId') customerId: string,
    @Param('documentId') documentId: string,
  ) {
    return this.svc.removeDocument(customerId, documentId);
  }
}
