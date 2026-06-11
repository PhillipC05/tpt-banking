import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CasesService } from './cases.service';
import { CaseType, CasePriority, CaseStatus } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

class CreateCaseDto {
  @IsUUID() customerId!: string;
  @IsEnum(CaseType) type!: CaseType;
  @IsOptional() @IsEnum(CasePriority) priority?: CasePriority;
  @IsString() subject!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID(undefined, { each: true }) alertIds?: string[];
  @IsOptional() @IsUUID() assignedToUserId?: string;
}

@ApiTags('Case Management')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('cases')
export class CasesController {
  constructor(private readonly casesService: CasesService) {}

  @Post()
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new compliance case' })
  create(@Body() dto: CreateCaseDto) {
    return this.casesService.create(dto);
  }

  @Get()
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all open compliance cases' })
  getOpen() {
    return this.casesService.findOpen();
  }

  @Get(':id')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get case by ID' })
  findOne(@Param('id') id: string) {
    return this.casesService.findByIdOrThrow(id);
  }

  @Get('customer/:customerId')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all cases for a customer' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.casesService.findByCustomer(customerId);
  }

  @Post(':id/notes')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Add a note to a case (append-only audit trail)' })
  addNote(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { note: string },
  ) {
    return this.casesService.addNote(id, user.sub, body.note);
  }

  @Post(':id/status')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update case status' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: { status: CaseStatus; closureReason?: string },
  ) {
    return this.casesService.updateStatus(id, body.status, user.sub, body.closureReason);
  }
}
