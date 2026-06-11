/**
 * Shape of the JWT access token payload.
 */
export interface JwtPayload {
  /** User UUID */
  sub: string;
  email: string;
  roles: string[];
  /** Session UUID — used to invalidate individual sessions */
  sessionId: string;
  /** Issued at (Unix seconds) */
  iat?: number;
  /** Expires at (Unix seconds) */
  exp?: number;
}

/**
 * Shape of the JWT refresh token payload.
 */
export interface JwtRefreshPayload {
  sub: string;
  sessionId: string;
  tokenFamily: string;
  iat?: number;
  exp?: number;
}

/**
 * The set of roles available in the platform.
 */
export enum Role {
  RETAIL_CUSTOMER = 'retail_customer',
  PREFERRED_CUSTOMER = 'preferred_customer',
  HNW_CLIENT = 'hnw_client',
  VIP_CLIENT = 'vip_client',
  RELATIONSHIP_MANAGER = 'relationship_manager',
  TELLER = 'teller',
  COMPLIANCE_OFFICER = 'compliance_officer',
  RISK_MANAGER = 'risk_manager',
  TREASURY_OFFICER = 'treasury_officer',
  TRADER = 'trader',
  ADMIN = 'admin',
  SUPER_ADMIN = 'super_admin',
}
