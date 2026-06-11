import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CtrService } from './ctr.service';
import { JwtAuthGuard, Roles, RolesGuard, Role, CurrentUser, JwtPayload } from '@tpt/auth';

@ApiTags('CTR Filing')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ctrs')
export class CtrController {
  constructor(private readonly ctrService: CtrService) {}

  @Get('pending')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get all pending CTRs awaiting FinCEN filing' })
  getPending() {
    return this.ctrService.findPending();
  }

  @Get('overdue')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get overdue CTRs (past 15-day filing deadline)' })
  getOverdue() {
    return this.ctrService.findOverdue();
  }

  @Get(':id')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get CTR by ID' })
  findOne(@Param('id') id: string) {
    return this.ctrService.findByIdOrThrow(id);
  }

  @Post(':id/file')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'File a CTR with FinCEN' })
  file(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.ctrService.file(id, user.sub);
  }
}
