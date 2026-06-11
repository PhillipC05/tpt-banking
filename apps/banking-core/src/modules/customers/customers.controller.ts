import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import { CustomerTier, KycStatus } from '@tpt/database';

@ApiTags('Customers')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @Roles(Role.TELLER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create a new customer (CIF record)' })
  @ApiResponse({ status: 201, description: 'Customer created' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  create(@Body() dto: CreateCustomerDto) {
    return this.customersService.create(dto);
  }

  @Get(':id')
  @Roles(Role.TELLER, Role.RELATIONSHIP_MANAGER, Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  findOne(@Param('id') id: string) {
    return this.customersService.findByIdOrThrow(id);
  }

  @Patch(':id/tier')
  @Roles(Role.RELATIONSHIP_MANAGER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update customer tier (RETAIL → PREFERRED → HNW → UHNW → VIP)' })
  updateTier(@Param('id') id: string, @Body() body: { tier: CustomerTier }) {
    return this.customersService.updateTier(id, body.tier);
  }

  @Patch(':id/kyc-status')
  @Roles(Role.COMPLIANCE_OFFICER, Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Update KYC status for a customer' })
  updateKycStatus(@Param('id') id: string, @Body() body: { status: KycStatus }) {
    return this.customersService.updateKycStatus(id, body.status);
  }
}
