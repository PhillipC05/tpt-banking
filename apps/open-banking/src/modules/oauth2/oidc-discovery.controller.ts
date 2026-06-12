import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('OpenID Connect Discovery')
@Controller('.well-known')
export class OidcDiscoveryController {
  @Get('openid-configuration')
  @ApiOperation({
    summary: 'OpenID Connect Discovery Document — OIDC Discovery §4',
    description: 'Returns the OIDC provider metadata document for client auto-configuration.',
  })
  getDiscovery() {
    const base = process.env['OPEN_BANKING_BASE_URL'] ?? 'http://localhost:3003';
    return {
      issuer:                                base,
      authorization_endpoint:               `${base}/v1/oauth2/authorize`,
      token_endpoint:                        `${base}/v1/oauth2/token`,
      userinfo_endpoint:                     `${base}/v1/oauth2/userinfo`,
      end_session_endpoint:                  `${base}/v1/oauth2/revoke`,
      introspection_endpoint:                `${base}/v1/oauth2/introspect`,
      jwks_uri:                              `${base}/v1/.well-known/jwks.json`,
      registration_endpoint:                 `${base}/v1/clients/register`,
      scopes_supported:                      ['openid', 'accounts', 'payments', 'fundsconfirmations'],
      response_types_supported:              ['code'],
      response_modes_supported:              ['query'],
      grant_types_supported:                 ['authorization_code', 'refresh_token'],
      subject_types_supported:               ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_post', 'none'],
      code_challenge_methods_supported:      ['S256'],
      claims_supported:                      ['sub', 'iss', 'aud', 'iat', 'exp', 'email', 'name', 'email_verified'],
    };
  }
}
