import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard that requires a valid RS256 JWT access token in the Authorization header.
 * Attach with @UseGuards(JwtAuthGuard) or set globally.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
