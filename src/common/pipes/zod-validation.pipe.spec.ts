import { z } from 'zod';
import { AppException } from '../exceptions/app.exception.js';
import { ZodValidationPipe } from './zod-validation.pipe.js';

describe('ZodValidationPipe', () => {
  it('유효한 입력은 파싱 및 변환된 값을 반환한다', () => {
    const schema = z.object({
      nickname: z.string().trim().min(1),
    });
    const pipe = new ZodValidationPipe(schema);

    expect(pipe.transform({ nickname: '  김스위프  ' })).toEqual({
      nickname: '김스위프',
    });
  });

  it('중첩 필드 검증 실패 시 점(.)으로 이어진 field와 AppException을 던진다', () => {
    const schema = z.object({
      profile: z.object({
        pin: z.string().regex(/^\d{4}$/, 'PIN은 숫자 4자리여야 합니다.'),
      }),
    });
    const pipe = new ZodValidationPipe(schema);

    let caught: unknown;
    try {
      pipe.transform({ profile: { pin: 'ab' } });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppException);
    const appError = caught as AppException;
    expect(appError.getStatus()).toBe(400);
    expect(appError.getResponse()).toEqual({
      code: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      details: [
        {
          field: 'profile.pin',
          reason: 'PIN은 숫자 4자리여야 합니다.',
        },
      ],
    });
  });

  it('루트 스키마 검증 실패 시 field는 _root로 반환한다', () => {
    const schema = z.string().min(2, '2자 이상 입력해 주세요.');
    const pipe = new ZodValidationPipe(schema);

    let caught: unknown;
    try {
      pipe.transform('a');
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AppException);
    const appError = caught as AppException;
    expect(appError.getStatus()).toBe(400);
    expect(appError.getResponse()).toEqual({
      code: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      details: [
        {
          field: '_root',
          reason: '2자 이상 입력해 주세요.',
        },
      ],
    });
  });
});
