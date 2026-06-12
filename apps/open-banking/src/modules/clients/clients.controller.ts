import { Body, Controller, Get, Param, Post, UseGuards, SetMetadata } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ClientsService } from './clients.service';
import { OpenBankingStandard, TppType } from '@tpt/database';
import { JwtAuthGuard, Roles, RolesGuard, Role } from '@tpt/auth';
import { IsArray, IsEnum, IsOptional, IsString, IsUrl } from 'class-validator';

const IS_PUBLIC_KEY = 'isPublic';
const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

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

  // ── Dynamic Client Registration (RFC 7591) — unauthenticated ─────────────

  @Post('register')
  @Public()
  @UseGuards()  // override class-level guards — DCR is unauthenticated per RFC 7591
  @ApiOperation({
    summary: 'Dynamic Client Registration — RFC 7591 (unauthenticated)',
    description: 'Self-service TPP onboarding. Accepts an optional software_statement JWT (SSA). Client is activated immediately.',
  })
  dynamicRegister(
    @Body() body: {
      software_statement?: string;
      redirect_uris:       string[];
      grant_types?:        string[];
      scope?:              string;
      client_name?:        string;
      logo_uri?:           string;
      policy_uri?:         string;
      tos_uri?:            string;
      jwks_uri?:           string;
      token_endpoint_auth_method?: string;
    },
  ) {
    return this.clientsService.dynamicRegister(body);
  }
}
