export interface LoginRequest {
  email: string;
  password: string;
  totpCode?: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  phone?: string;
}

export interface LoginResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface RegisterResponse {
  userId: string;
  email: string;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface JwtPayload {
  sub: string;
  email: string;
  roles: string[];
  sessionId: string;
  iat?: number;
  exp?: number;
}
