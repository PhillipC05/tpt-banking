import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SarService } from './sar.service';
import { SarSuspiciousActivityType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, MaxLength, Min,
} from 'class-validator';

class CreateSarDto {
  @IsUUID() customerId!: string;
  @IsOptional() @IsUUID() caseId?: string;
  @IsEnum(SarSuspiciousActivityType) activityType!: SarSuspiciousActivityType;
  @IsNumber() @Min(0.01) suspiciousAmount!: number;
  @IsDateString() activityFrom!: string;
  @IsDateString() activityTo!: string;
  @IsString() @MaxLength(8000) narrative!: string;
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) relatedTransactionIds?: string[];
  @IsOptional() @IsArray() @IsUUID(undefined, { each: true }) relatedAccountIds?: string[];
}

@ApiTags('SAR Filing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sars')
export class SarController {
  constructor(private readonly sarService: SarService) {}

  @Post()
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a SAR draft' })
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateSarDto) {
    return this.sarService.create({
      ...dto,
      activityFrom: new Date(dto.activityFrom),
      activityTo: new Date(dto.activityTo),
      preparedByUserId: user.sub,
    });
  }

  @Get('pending')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all SARs pending approval or filing' })
  getPending() {
    return this.sarService.findPendingFiling();
  }

  @Get('overdue')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get overdue SARs (past 30-day filing deadline)' })
  getOverdue() {
    return this.sarService.findOverdue();
  }

  @Get(':id')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get SAR by ID' })
  findOne(@Param('id') id: string) {
    return this.sarService.findByIdOrThrow(id);
  }

  @Post(':id/approve/first')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'First compliance officer approval (dual-control — cannot be preparer)' })
  approveFirst(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.sarService.approveFirst(id, user.sub);
  }

  @Post(':id/approve/second')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Second compliance officer approval (must differ from first approver)' })
  approveSecond(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.sarService.approveSecond(id, user.sub);
  }

  @Post(':id/file')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'File approved SAR with FinCEN' })
  file(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.sarService.file(id, user.sub);
  }
}
