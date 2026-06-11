import {
  Body, Controller, Get, Post, Query, Res, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Response } from 'express';
import { OAuth2Service } from './oauth2.service';

/**
 * OAuth2 Authorization Server endpoints.
 *
 * Implements RFC 6749 (OAuth 2.0) + RFC 7636 (PKCE) + RFC 7662 (Token Introspection)
 *
 * Flow:
 *   1. TPP calls GET /oauth2/authorize → redirected to consent UI
 *   2. PSU authenticates + approves → POST /oauth2/authorize/complete
 *   3. TPP calls POST /oauth2/token with auth code + code_verifier
 *   4. TPP uses access_token to call AISP/PISP resource APIs
 *   5. TPP refreshes with POST /oauth2/token (grant_type=refresh_token)
 */
@ApiTags('OAuth2 Authorization Server')
@Controller('oauth2')
export class OAuth2Controller {
  constructor(private readonly oauth2Service: OAuth2Service) {}

  /**
   * Authorization endpoint — RFC 6749 §3.1
   * Validates client and scope, creates consent, returns authorization URL for PSU.
   */
  @Get('authorize')
  @ApiOperation({
    summary: 'OAuth2 authorization endpoint (PKCE S256 required)',
    description: 'Validates client registration, creates consent, and returns redirect URL for PSU authentication.',
  })
  async authorize(
    @Query('client_id') clientId: string,
    @Query('redirect_uri') redirectUri: string,
    @Query('scope') scope: string,
    @Query('response_type') responseType: string,
    @Query('code_challenge') codeChallenge: string,
    @Query('code_challenge_method') codeChallengeMethod: string,
    @Query('state') state: string,
    @Query('consent_id') consentId: string,
    @Res() res: Response,
  ) {
    const { authorizationUrl, consentId: newConsentId } =
      await this.oauth2Service.buildAuthorizationUrl({
        clientId,
        redirectUri,
        scope,
        state,
        codeChallenge,
        codeChallengeMethod: codeChallengeMethod as 'S256',
        consentId,
      });

    // Redirect PSU to the consent/authentication page
    res.redirect(302, authorizationUrl);
  }

  /**
   * Called by the consent UI after PSU authenticates and approves.
   * Issues authorization code and redirects back to TPP's redirect_uri.
   */
  @Post('authorize/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete PSU authorization — issues auth code, redirects to TPP' })
  async completeAuthorization(
    @Body() body: {
      consentId: string;
      customerId: string;
      approvedAccountIds: string[];
    },
  ) {
    return this.oauth2Service.authorizeConsent(
      body.consentId,
      body.customerId,
      body.approvedAccountIds,
    );
  }

  /**
   * Token endpoint — RFC 6749 §3.2
   * Exchanges authorization code for access + refresh tokens, or refreshes access token.
   */
  @Post('token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Token endpoint — exchange auth code or refresh access token',
    description:
      'grant_type=authorization_code: exchanges code+code_verifier for tokens.\n' +
      'grant_type=refresh_token: rotates refresh token and issues new access token.',
  })
  async token(
    @Body() body: {
      grant_type: string;
      client_id: string;
      client_secret?: string;
      code?: string;
      redirect_uri?: string;
      code_verifier?: string;
      refresh_token?: string;
    },
  ) {
    if (body.grant_type === 'authorization_code') {
      return this.oauth2Service.exchangeCodeForTokens({
        clientId: body.client_id,
        clientSecret: body.client_secret,
        code: body.code!,
        redirectUri: body.redirect_uri!,
        codeVerifier: body.code_verifier!,
      });
    }

    if (body.grant_type === 'refresh_token') {
      return this.oauth2Service.refreshAccessToken({
        clientId: body.client_id,
        clientSecret: body.client_secret,
        refreshToken: body.refresh_token!,
      });
    }

    throw new Error(`Unsupported grant_type: ${body.grant_type}`);
  }

  /**
   * Token introspection — RFC 7662
   * Allows resource servers to validate tokens.
   */
  @Post('introspect')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Token introspection — RFC 7662' })
  introspect(@Body() body: { token: string; client_id: string }) {
    return this.oauth2Service.introspectToken(body.token, body.client_id);
  }

  /**
   * Token revocation — RFC 7009
   */
  @Post('revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Revoke an access or refresh token — RFC 7009' })
  async revoke(@Body() body: { token: string }) {
    await this.oauth2Service.revokeToken(body.token);
    return {};
  }
}
