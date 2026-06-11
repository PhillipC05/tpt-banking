import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ScreeningService } from './screening.service';
import { ScreeningTrigger } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';
import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';

class ScreenCustomerDto {
  @IsUUID() customerId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() dateOfBirth?: string;
  @IsOptional() @IsString() nationality?: string;
  @IsEnum(ScreeningTrigger) trigger!: ScreeningTrigger;
}

class ResolveScreeningDto {
  @IsString() decision!: 'CONFIRMED_MATCH' | 'FALSE_POSITIVE';
  @IsOptional() @IsString() notes?: string;
}

@ApiTags('Sanctions & Screening')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('screening')
export class ScreeningController {
  constructor(private readonly screeningService: ScreeningService) {}

  @Post('screen')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Run OFAC/sanctions/PEP/adverse-media screening for a customer' })
  screen(@Body() dto: ScreenCustomerDto) {
    return this.screeningService.screenCustomer(dto);
  }

  @Get('customer/:customerId')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN, Role.RELATIONSHIP_MANAGER)
  @ApiOperation({ summary: 'Get all screening results for a customer' })
  findByCustomer(@Param('customerId') customerId: string) {
    return this.screeningService.findByCustomer(customerId);
  }

  @Get('pending')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all screening results pending review (HITs)' })
  getPendingReviews() {
    return this.screeningService.findPendingReviews();
  }

  @Post(':id/resolve')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Resolve a screening hit (confirmed match or false positive)' })
  resolve(
    @Param('id') id: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: ResolveScreeningDto,
  ) {
    return this.screeningService.resolveScreening(id, user.sub, dto.decision, dto.notes);
  }
}
