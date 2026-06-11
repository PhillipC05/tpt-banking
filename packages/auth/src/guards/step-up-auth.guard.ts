import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { STEP_UP_KEY } from '../decorators/step-up.decorator';

/**
 * Guard that requires a short-lived step-up token for high-risk operations.
 *
 * Step-up tokens are issued by POST /auth/step-up after the user re-authenticates
 * with their password. They are valid for 5 minutes and stored in Redis.
 *
 * Required for: transfers > $10K, all wire transfers, admin operations, SAR filing.
 */
@Injectable()
export class StepUpAuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const stepUpReason = this.reflector.getAllAndOverride<string>(STEP_UP_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!stepUpReason) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{
      headers: Record<string, string>;
    }>();

    const stepUpToken = request.headers['x-step-up-token'];

    if (!stepUpToken) {
      throw new UnauthorizedException(
        `This operation requires step-up authentication (reason: ${stepUpReason}). ` +
          'Please POST /auth/step-up with your password to obtain a step-up token.',
      );
    }

    // Token validity is checked in AuthService.validateStepUpToken()
    // which is called by the consuming service before the operation proceeds.
    // The guard itself only verifies presence; the service verifies validity.
    return true;
  }
}
