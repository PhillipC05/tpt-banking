import {
  Controller, Get, Post, Patch, Param, Body, Query,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiQuery } from '@nestjs/swagger';
import {
  FamilyOfficeService,
  EntityType,
  RelationshipType,
  DistributionClass,
  DocumentType,
  HoldingSnapshot,
  IPSPolicy,
} from './family-office.service';

@ApiTags('Family Office')
@ApiBearerAuth('access-token')
@Controller('family-office')
export class FamilyOfficeController {
  constructor(private readonly svc: FamilyOfficeService) {}

  // ── Family Groups ─────────────────────────────────────────────────────────

  @Post('groups')
  @ApiOperation({ summary: 'Create a new family group (top-level family office structure)' })
  createGroup(
    @Body() body: { familyName: string; relationshipManagerId?: string; notes?: string },
  ) {
    return this.svc.createFamilyGroup(body);
  }

  @Get('groups')
  @ApiOperation({ summary: 'List all family groups' })
  listGroups() {
    return this.svc.listGroups();
  }

  @Get('groups/:groupId')
  @ApiOperation({ summary: 'Get a specific family group' })
  getGroup(@Param('groupId') groupId: string) {
    return this.svc.getGroup(groupId);
  }

  // ── Entities ──────────────────────────────────────────────────────────────

  @Post('groups/:groupId/entities')
  @ApiOperation({ summary: 'Add a legal entity (individual, LLC, trust, etc.) to a family group' })
  addEntity(
    @Param('groupId') groupId: string,
    @Body() body: {
      name: string;
      entityType: EntityType;
      jurisdiction: string;
      taxId?: string;
      incorporationDate?: string;
      registeredAgent?: string;
      accountIds?: string[];
      holdingsSnapshot?: HoldingSnapshot[];
    },
  ) {
    return this.svc.addEntity(groupId, body);
  }

  @Get('groups/:groupId/entities')
  @ApiOperation({ summary: 'List all entities in a family group' })
  listEntities(@Param('groupId') groupId: string) {
    return this.svc.listGroupEntities(groupId);
  }

  @Patch('groups/:groupId/entities/:entityId/holdings')
  @ApiOperation({ summary: 'Update an entity\'s holdings snapshot for consolidation' })
  updateHoldings(
    @Param('entityId') entityId: string,
    @Body() body: { holdings: HoldingSnapshot[] },
  ) {
    return this.svc.updateEntityHoldings(entityId, body.holdings);
  }

  // ── Entity Relationship Graph ─────────────────────────────────────────────

  @Post('groups/:groupId/relationships')
  @ApiOperation({ summary: 'Add a relationship between two entities (owner, trustee, beneficiary, etc.)' })
  addRelationship(
    @Param('groupId') groupId: string,
    @Body() body: {
      fromEntityId: string;
      toEntityId: string;
      relationshipType: RelationshipType;
      ownershipPct?: string;
      effectiveDate?: string;
      notes?: string;
    },
  ) {
    return this.svc.addRelationship(groupId, body);
  }

  @Get('groups/:groupId/entity-graph')
  @ApiOperation({ summary: 'Get the full entity relationship graph with adjacency list' })
  getEntityGraph(@Param('groupId') groupId: string) {
    return this.svc.getEntityGraph(groupId);
  }

  // ── Beneficiaries ─────────────────────────────────────────────────────────

  @Post('groups/:groupId/beneficiaries')
  @ApiOperation({ summary: 'Register a beneficiary for a family group' })
  addBeneficiary(
    @Param('groupId') groupId: string,
    @Body() body: {
      entityId: string;
      distributionClass: DistributionClass;
      distributionPct?: string;
      restrictedUntilAge?: number;
      notes?: string;
    },
  ) {
    return this.svc.addBeneficiary(groupId, body);
  }

  @Get('groups/:groupId/beneficiaries')
  @ApiOperation({ summary: 'List all beneficiaries for a family group' })
  listBeneficiaries(@Param('groupId') groupId: string) {
    return this.svc.listBeneficiaries(groupId);
  }

  @Post('groups/:groupId/distributions')
  @ApiOperation({ summary: 'Record a distribution to a beneficiary' })
  recordDistribution(
    @Param('groupId') groupId: string,
    @Body() body: {
      beneficiaryId: string;
      amount: string;
      distributionClass: DistributionClass;
      standard: 'DISCRETIONARY' | 'MANDATORY' | 'HEMS' | 'UNITRUST_PCT';
      taxWithheld?: string;
      notes?: string;
      approvedBy: string;
    },
  ) {
    return this.svc.recordDistribution(groupId, body);
  }

  @Get('groups/:groupId/distributions')
  @ApiOperation({ summary: 'List distributions, optionally filtered by beneficiary' })
  @ApiQuery({ name: 'beneficiaryId', required: false })
  listDistributions(
    @Param('groupId') groupId: string,
    @Query('beneficiaryId') beneficiaryId?: string,
  ) {
    return this.svc.listDistributions(groupId, beneficiaryId);
  }

  // ── IPS ───────────────────────────────────────────────────────────────────

  @Post('groups/:groupId/ips')
  @ApiOperation({ summary: 'Create (or replace) Investment Policy Statement for a family group' })
  createIPS(
    @Param('groupId') groupId: string,
    @Body() body: Omit<IPSPolicy, 'ipsId' | 'groupId' | 'status'>,
  ) {
    return this.svc.createIPS(groupId, body);
  }

  @Get('groups/:groupId/ips')
  @ApiOperation({ summary: 'Get the current active IPS for a family group' })
  getIPS(@Param('groupId') groupId: string) {
    return this.svc.getActiveIPS(groupId);
  }

  @Post('groups/:groupId/ips/enforce')
  @ApiOperation({ summary: 'Run IPS enforcement check — returns all new violations detected' })
  enforceIPS(@Param('groupId') groupId: string) {
    return this.svc.enforceIPS(groupId);
  }

  @Get('groups/:groupId/ips/violations')
  @ApiOperation({ summary: 'List IPS violations, optionally showing only open/unresolved ones' })
  @ApiQuery({ name: 'openOnly', required: false })
  listViolations(
    @Param('groupId') groupId: string,
    @Query('openOnly') openOnly?: string,
  ) {
    return this.svc.listIPSViolations(groupId, openOnly === 'true');
  }

  @Patch('ips/violations/:violationId/resolve')
  @ApiOperation({ summary: 'Mark an IPS violation as resolved' })
  resolveViolation(
    @Param('violationId') violationId: string,
    @Body() body: { resolvedBy: string },
  ) {
    return this.svc.resolveIPSViolation(violationId, body.resolvedBy);
  }

  // ── Document Vault ────────────────────────────────────────────────────────

  @Post('documents')
  @ApiOperation({ summary: 'Store a document in the encrypted vault (AES-256, key managed by Vault KMS)' })
  storeDocument(
    @Body() body: {
      groupId: string;
      entityId?: string;
      documentType: DocumentType;
      title: string;
      sizeBytes: number;
      uploadedBy: string;
      tags?: string[];
    },
  ) {
    return this.svc.storeDocument(body);
  }

  @Get('documents/:documentId')
  @ApiOperation({ summary: 'Retrieve document metadata from vault (access logged)' })
  @ApiQuery({ name: 'accessedBy', required: false })
  getDocument(
    @Param('documentId') documentId: string,
    @Query('accessedBy') accessedBy?: string,
  ) {
    return this.svc.getDocument(documentId, accessedBy);
  }

  @Get('groups/:groupId/documents')
  @ApiOperation({ summary: 'List all documents for a group, optionally filtered by entity' })
  @ApiQuery({ name: 'entityId', required: false })
  listDocuments(
    @Param('groupId') groupId: string,
    @Query('entityId') entityId?: string,
  ) {
    return this.svc.listGroupDocuments(groupId, entityId);
  }

  // ── Consolidated Balance Sheet ─────────────────────────────────────────────

  @Get('groups/:groupId/consolidated-balance-sheet')
  @ApiOperation({ summary: 'Consolidated balance sheet across all entities in the family group' })
  getConsolidatedBS(@Param('groupId') groupId: string) {
    return this.svc.getConsolidatedBalanceSheet(groupId);
  }

  // ── GIPS Household Report ─────────────────────────────────────────────────

  @Post('groups/:groupId/gips-report')
  @ApiOperation({ summary: 'Generate GIPS-compliant household performance report (TWRR, MWRR, attribution)' })
  generateGIPSReport(
    @Param('groupId') groupId: string,
    @Body() body: {
      periodStart: string;
      periodEnd: string;
      openingMarketValue: string;
      closingMarketValue: string;
      netCashFlows: string;
      benchmarkReturnPct: string;
      feesPaid: string;
    },
  ) {
    return this.svc.generateGIPSReport(groupId, body);
  }
}
