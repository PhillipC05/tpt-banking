import { SetMetadata } from '@nestjs/common';

export const STEP_UP_KEY = 'step_up_required';

/**
 * Decorator that marks a route as requiring step-up authentication.
 * Used with StepUpAuthGuard.
 *
 * @param reason - Human-readable reason displayed to the user when step-up is required
 *
 * @example
 * @RequireStepUp('high-value-transfer')
 * @Post('/transfers')
 * createTransfer() {}
 */
export const RequireStepUp = (reason: string) => SetMetadata(STEP_UP_KEY, reason);
