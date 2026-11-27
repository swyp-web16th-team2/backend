import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  AppException,
  type ErrorDetail,
  type ErrorResponseBody,
} from '../exceptions/app.exception.js';

const DEFAULT_ERROR_CODES: Record<number, string> = {
  [HttpStatus.BAD_REQUEST]: 'BAD_REQUEST',
  [HttpStatus.UNAUTHORIZED]: 'UNAUTHORIZED',
  [HttpStatus.FORBIDDEN]: 'FORBIDDEN',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.METHOD_NOT_ALLOWED]: 'METHOD_NOT_ALLOWED',
  [HttpStatus.CONFLICT]: 'CONFLICT',
  [HttpStatus.PAYLOAD_TOO_LARGE]: 'PAYLOAD_TOO_LARGE',
  [HttpStatus.UNSUPPORTED_MEDIA_TYPE]: 'UNSUPPORTED_MEDIA_TYPE',
  [HttpStatus.UNPROCESSABLE_ENTITY]: 'UNPROCESSABLE_ENTITY',
  [HttpStatus.TOO_MANY_REQUESTS]: 'TOO_MANY_REQUESTS',
  [HttpStatus.SERVICE_UNAVAILABLE]: 'SERVICE_UNAVAILABLE',
};

const INTERNAL_ERROR_BODY: ErrorResponseBody = {
  code: 'INTERNAL_SERVER_ERROR',
  message: '일시적인 오류가 발생했습니다.',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isErrorDetailArray(value: unknown): value is ErrorDetail[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        isRecord(item) &&
        typeof item.field === 'string' &&
        typeof item.reason === 'string',
    )
  );
}

function isHealthDegradedResponse(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }
  const keys = Object.keys(value);
  return (
    keys.length === 3 &&
    value.status === 'degraded' &&
    (value.db === 'up' || value.db === 'down') &&
    (value.redis === 'up' || value.redis === 'down')
  );
}

function extractMessage(rawResponse: unknown, fallback: string): string {
  if (typeof rawResponse === 'string' && rawResponse.length > 0) {
    return rawResponse;
  }
  if (isRecord(rawResponse)) {
    if (
      typeof rawResponse.message === 'string' &&
      rawResponse.message.length > 0
    ) {
      return rawResponse.message;
    }
    if (Array.isArray(rawResponse.message)) {
      const joined = rawResponse.message
        .filter(
          (item): item is string => typeof item === 'string' && item.length > 0,
        )
        .join(', ');
      if (joined.length > 0) {
        return joined;
      }
    }
  }
  return fallback || '요청을 처리할 수 없습니다.';
}

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();
    const targetUrl =
      request?.originalUrl || request?.url || request?.path || '';

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const rawResponse = exception.getResponse();

      // HealthController의 503 degraded 응답만 프로브 계약 유지를 위해 예외적으로 원형을 유지한다.
      if (
        status === HttpStatus.SERVICE_UNAVAILABLE &&
        request?.path === '/health' &&
        isHealthDegradedResponse(rawResponse)
      ) {
        response.status(status).json(rawResponse);
        return;
      }

      if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
        this.logger.error(
          `${request?.method ?? 'UNKNOWN'} ${targetUrl} -> ${status}`,
          exception.stack ?? exception.message,
        );
        response.status(status).json(INTERNAL_ERROR_BODY);
        return;
      }

      if (exception instanceof AppException) {
        response.status(status).json(rawResponse);
        return;
      }

      if (
        isRecord(rawResponse) &&
        typeof rawResponse.code === 'string' &&
        typeof rawResponse.message === 'string'
      ) {
        const body: ErrorResponseBody =
          isErrorDetailArray(rawResponse.details) &&
          rawResponse.details.length > 0
            ? {
                code: rawResponse.code,
                message: rawResponse.message,
                details: rawResponse.details,
              }
            : {
                code: rawResponse.code,
                message: rawResponse.message,
              };
        response.status(status).json(body);
        return;
      }

      const defaultCode = DEFAULT_ERROR_CODES[status] ?? `HTTP_${status}`;
      const body: ErrorResponseBody = {
        code: defaultCode,
        message: extractMessage(rawResponse, exception.message),
      };
      response.status(status).json(body);
      return;
    }

    this.logger.error(
      `${request?.method ?? 'UNKNOWN'} ${targetUrl} -> ${HttpStatus.INTERNAL_SERVER_ERROR}`,
      exception instanceof Error
        ? (exception.stack ?? exception.message)
        : String(exception),
    );
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(INTERNAL_ERROR_BODY);
  }
}
