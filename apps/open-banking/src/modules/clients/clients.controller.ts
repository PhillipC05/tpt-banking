import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { OpenBankingStandard, TppType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

class RegisterClientDto {
  @IsString() clientName!: string;
  @IsOptional() @IsString() clientDescription?: string;
  @IsEnum(OpenBankingStandard) standard!: OpenBankingStandard;
  @IsArray() @IsEnum(TppType, { each: true }) tppTypes!: TppType[];
  @IsArray() @IsUrl({}, { each: true }) redirectUris!: string[];
  @IsArray() @IsString({ each: true }) allowedScopes!: string[];
  @IsOptional() @IsArray() grantTypes?: string[];
  @IsOptional() @IsString() regulatoryRegistrationId?: string;
  @IsOptional() @IsUrl() logoUri?: string;
}

@ApiTags('Open Banking — Client Registry')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('clients')
export class ClientsController {
  constructor(private readonly clientsService: ClientsService) {}

  @Post()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Register a new Open Banking TPP client' })
  register(@Body() dto: RegisterClientDto) {
    return this.clientsService.register(dto);
  }

  @Get()
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'List all registered TPP clients' })
  findAll() {
    return this.clientsService.findAll();
  }

  @Post(':clientId/activate')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Activate a pending TPP client' })
  activate(@Param('clientId') clientId: string) {
    return this.clientsService.activate(clientId);
  }

  @Post(':clientId/suspend')
  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @ApiOperation({ summary: 'Suspend an active TPP client' })
  suspend(@Param('clientId') clientId: string) {
    return this.clientsService.suspend(clientId);
  }
}
