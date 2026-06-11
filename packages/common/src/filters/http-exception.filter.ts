import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { BankingError } from '@tpt/shared';
import { v4 as uuidv4 } from 'uuid';

interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    requestId: string;
    timestamp: string;
    path: string;
  };
}

/**
 * Global exception filter.
 * Maps NestJS HttpExceptions and domain BankingErrors to a consistent
 * JSON error envelope. PII is never logged — only error codes and safe messages.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = uuidv4();

    let statusCode: number;
    let code: string;
    let message: string;
    let details: Record<string, unknown> | undefined;

    if (exception instanceof BankingError) {
      statusCode = exception.statusCode;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const exceptionResponse = exception.getResponse();
      code = this.httpStatusToCode(statusCode);

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;
        message = (resp['message'] as string) ?? exception.message;
        if (Array.isArray(resp['message'])) {
          message = 'Validation failed';
          details = { errors: resp['message'] };
        }
      } else {
        message = String(exceptionResponse);
      }
    } else {
      statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
      code = 'INTERNAL_ERROR';
      message = 'An unexpected error occurred';
      this.logger.error(
        `Unhandled exception [${requestId}]: ${exception instanceof Error ? exception.message : String(exception)}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    }

    if (statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.path} → ${statusCode} [${code}] requestId=${requestId}`,
      );
    } else if (statusCode >= 400) {
      this.logger.warn(
        `${request.method} ${request.path} → ${statusCode} [${code}] requestId=${requestId}`,
      );
    }

    const body: ErrorResponse = {
      error: {
        code,
        message,
        details,
        requestId,
        timestamp: new Date().toISOString(),
        path: request.path,
      },
    };

    response.status(statusCode).json(body);
  }

  private httpStatusToCode(status: number): string {
    const map: Record<number, string> = {
      400: 'BAD_REQUEST',
      401: 'UNAUTHORIZED',
      403: 'FORBIDDEN',
      404: 'NOT_FOUND',
      409: 'CONFLICT',
      422: 'UNPROCESSABLE_ENTITY',
      429: 'TOO_MANY_REQUESTS',
      500: 'INTERNAL_ERROR',
      503: 'SERVICE_UNAVAILABLE',
    };
    return map[status] ?? `HTTP_${status}`;
  }
}
