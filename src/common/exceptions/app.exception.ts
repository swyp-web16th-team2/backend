import { HttpException, type HttpStatus } from '@nestjs/common';

export interface ErrorDetail {
  field: string;
  reason: string;
}

export interface ErrorResponseBody {
  code: string;
  message: string;
  details?: ErrorDetail[];
}

export class AppException extends HttpException {
  constructor(
    status: HttpStatus | number,
    code: string,
    message: string,
    details?: ErrorDetail[],
  ) {
    const body: ErrorResponseBody =
      details && details.length > 0
        ? { code, message, details }
        : { code, message };
    super(body, status);
  }
}
