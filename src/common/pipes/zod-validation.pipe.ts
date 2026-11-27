import { HttpStatus, type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { AppException, type ErrorDetail } from '../exceptions/app.exception.js';

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    const details: ErrorDetail[] = result.error.issues.map((issue) => ({
      field: issue.path.length > 0 ? issue.path.map(String).join('.') : '_root',
      reason: issue.message,
    }));

    throw new AppException(
      HttpStatus.BAD_REQUEST,
      'VALIDATION_ERROR',
      '입력값이 올바르지 않습니다.',
      details,
    );
  }
}
