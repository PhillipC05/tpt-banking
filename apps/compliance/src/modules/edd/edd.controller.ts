import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard, Roles, Role } from '@tpt/auth';
import { CurrentUser } from '@tpt/common';
import { EddService } from './edd.service';
import {
  InitiateEddDto,
  SeniorManagerApprovalDto,
  SubmitQuestionnaireDto,
} from './dto/initiate-edd.dto';

@ApiTags('EDD — Enhanced Due Diligence')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('edd')
export class EddController {
  constructor(private readonly eddService: EddService) {}

  @Post()
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Initiate an EDD questionnaire (triggered by HIGH/VERY_HIGH CDD risk or HNW/VIP tier)' })
  initiate(@Body() dto: InitiateEddDto) {
    return this.eddService.initiateQuestionnaire(dto);
  }

  @Get('queue/pending-review')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List EDD questionnaires pending review or manager approval' })
  pendingReview() {
    return this.eddService.findPendingReview();
  }

  @Get(':id')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Get an EDD questionnaire by ID' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.eddService.findByIdOrThrow(id);
  }

  @Get('customer/:customerId')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'List EDD questionnaires for a customer' })
  byCustomer(@Param('customerId', ParseUUIDPipe) customerId: string) {
    return this.eddService.findByCustomer(customerId);
  }

  @Patch(':id/submit')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Submit customer responses to the EDD questionnaire' })
  submitResponses(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SubmitQuestionnaireDto,
  ) {
    return this.eddService.submitCustomerResponses(id, dto);
  }

  @Patch(':id/review')
  @Roles(Role.compliance_officer, Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Compliance officer reviews questionnaire — approve, decline, or escalate to senior manager' })
  review(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
    @Body() body: { decision: 'ESCALATE_TO_MANAGER' | 'APPROVE' | 'DECLINE'; notes?: string },
  ) {
    return this.eddService.review(id, user.sub, body.decision, body.notes);
  }

  @Patch(':id/manager-approval')
  @Roles(Role.admin, Role.super_admin)
  @ApiOperation({ summary: 'Senior manager approval — required for HNW/VIP EDD sign-off' })
  managerApprove(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: { sub: string },
    @Body() dto: SeniorManagerApprovalDto,
  ) {
    return this.eddService.seniorManagerApprove(id, dto, user.sub);
  }
}
