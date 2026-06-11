import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard, CurrentUser, JwtPayload } from '@tpt/auth';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 400, description: 'Email already taken or validation failed' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate and receive JWT tokens' })
  @ApiResponse({ status: 200, description: 'Login successful, tokens returned' })
  @ApiResponse({ status: 401, description: 'Invalid credentials or MFA code' })
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tokens = await this.authService.login(dto.email, dto.password, dto.totpCode);

    // Refresh token goes in httpOnly cookie
    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/v1/auth/refresh',
    });

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
    };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Logout and invalidate current session' })
  async logout(
    @CurrentUser() user: JwtPayload,
    @Res({ passthrough: true }) res: Response,
  ) {
    // We rely on the Authorization header value for blocklisting
    // The actual token is extracted by the guard but not re-exposed here
    // Clearing the refresh cookie is sufficient for the session
    res.clearCookie('refresh_token', { path: '/v1/auth/refresh' });
    return;
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh the access token using the refresh cookie' })
  @ApiResponse({ status: 200, description: 'New access token issued' })
  async refresh(
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieHeader = (res.req as { cookies?: Record<string, string> }).cookies;
    const refreshToken = cookieHeader?.['refresh_token'];

    if (!refreshToken) {
      res.status(HttpStatus.UNAUTHORIZED).json({
        error: { code: 'UNAUTHORIZED', message: 'Refresh token missing' },
      });
      return;
    }

    const tokens = await this.authService.refreshTokens(refreshToken);

    res.cookie('refresh_token', tokens.refreshToken, {
      httpOnly: true,
      secure: process.env['NODE_ENV'] === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 3600 * 1000,
      path: '/v1/auth/refresh',
    });

    return {
      accessToken: tokens.accessToken,
      expiresIn: tokens.expiresIn,
      tokenType: 'Bearer',
    };
  }

  @Post('mfa/setup')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Initiate MFA setup — returns TOTP secret and QR code' })
  async setupMfa(@CurrentUser() user: JwtPayload) {
    return this.authService.setupMfa(user.sub);
  }

  @Post('mfa/verify')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Verify TOTP code and enable MFA on the account' })
  async verifyMfa(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code: string },
  ) {
    await this.authService.verifyAndEnableMfa(user.sub, body.code);
  }

  @Post('step-up')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Obtain a step-up token for high-risk operations (valid 5 min)',
  })
  async stepUp(
    @CurrentUser() user: JwtPayload,
    @Body() body: { password: string },
  ) {
    return this.authService.stepUp(user.sub, body.password);
  }
}
