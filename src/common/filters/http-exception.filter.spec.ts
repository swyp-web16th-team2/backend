import {
  type ArgumentsHost,
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { afterEach, vi } from 'vitest';
import { AppException } from '../exceptions/app.exception.js';
import { HttpExceptionFilter } from './http-exception.filter.js';

function createHost(path = '/api/test', method = 'GET') {
  const json = vi.fn();
  const status = vi.fn().mockReturnValue({ json });
  const host = {
    switchToHttp: () => ({
      getRequest: () => ({
        method,
        url: path,
        originalUrl: path,
        path,
      }),
      getResponse: () => ({ status }),
    }),
  } as unknown as ArgumentsHost;
  return { host, status, json };
}

describe('HttpExceptionFilter', () => {
  const filter = new HttpExceptionFilter();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('details가 없는 AppException은 code와 message만 응답한다', () => {
    const { host, status, json } = createHost();
    filter.catch(
      new AppException(409, 'SPACE_FULL', '모임 정원이 가득 찼습니다.'),
      host,
    );

    expect(status).toHaveBeenCalledWith(409);
    expect(json).toHaveBeenCalledWith({
      code: 'SPACE_FULL',
      message: '모임 정원이 가득 찼습니다.',
    });
  });

  it('details가 있는 AppException은 details까지 그대로 응답한다', () => {
    const { host, status, json } = createHost();
    filter.catch(
      new AppException(400, 'VALIDATION_ERROR', '입력값이 올바르지 않습니다.', [
        { field: 'nickname', reason: '최대 8자까지 입력 가능합니다.' },
      ]),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      code: 'VALIDATION_ERROR',
      message: '입력값이 올바르지 않습니다.',
      details: [{ field: 'nickname', reason: '최대 8자까지 입력 가능합니다.' }],
    });
  });

  it('Nest 기본 예외(404/403/409/413/415 등)를 공통 에러 형식으로 변환한다', () => {
    const cases: [HttpException, number, string, string][] = [
      [
        new NotFoundException('대상을 찾을 수 없습니다.'),
        404,
        'NOT_FOUND',
        '대상을 찾을 수 없습니다.',
      ],
      [
        new ForbiddenException('모임장만 변경할 수 있습니다.'),
        403,
        'FORBIDDEN',
        '모임장만 변경할 수 있습니다.',
      ],
      [
        new ConflictException('이미 사용 중인 닉네임입니다.'),
        409,
        'CONFLICT',
        '이미 사용 중인 닉네임입니다.',
      ],
      [
        new HttpException(
          'request entity too large',
          HttpStatus.PAYLOAD_TOO_LARGE,
        ),
        413,
        'PAYLOAD_TOO_LARGE',
        'request entity too large',
      ],
      [
        new HttpException(
          'Unsupported Media Type',
          HttpStatus.UNSUPPORTED_MEDIA_TYPE,
        ),
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'Unsupported Media Type',
      ],
    ];

    for (const [err, expectedStatus, expectedCode, expectedMessage] of cases) {
      const { host, status, json } = createHost();
      filter.catch(err, host);

      expect(status).toHaveBeenCalledWith(expectedStatus);
      expect(json).toHaveBeenCalledWith({
        code: expectedCode,
        message: expectedMessage,
      });
    }
  });

  it('5xx HttpException 및 AppException도 로그만 남기고 내부 메시지를 숨긴다', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const cases: HttpException[] = [
      new InternalServerErrorException('prisma connection string leaked'),
      new HttpException('db password secret leaked', 500),
      new AppException(500, 'CUSTOM_500', 'internal detail'),
    ];

    for (const err of cases) {
      const { host, status, json } = createHost('/api/spaces', 'POST');
      filter.catch(err, host);

      expect(status).toHaveBeenCalledWith(500);
      expect(json).toHaveBeenCalledWith({
        code: 'INTERNAL_SERVER_ERROR',
        message: '일시적인 오류가 발생했습니다.',
      });
    }

    expect(errorSpy).toHaveBeenCalledTimes(cases.length);
  });

  it('/health의 정상 503 degraded 응답 모양만 그대로 유지한다', () => {
    const { host, status, json } = createHost('/health');
    filter.catch(
      new ServiceUnavailableException({
        status: 'degraded',
        db: 'down',
        redis: 'up',
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(503);
    expect(json).toHaveBeenCalledWith({
      status: 'degraded',
      db: 'down',
      redis: 'up',
    });
  });

  it('조건에 맞지 않는 status:degraded 응답은 공통 에러 스키마를 우회할 수 없다', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const badReq = createHost('/api/spaces');
    filter.catch(
      new BadRequestException({ status: 'degraded', foo: 'bar' }),
      badReq.host,
    );
    expect(badReq.status).toHaveBeenCalledWith(400);
    expect(badReq.json).toHaveBeenCalledWith({
      code: 'BAD_REQUEST',
      message: expect.any(String),
    });

    const missingFields = createHost('/health');
    filter.catch(
      new ServiceUnavailableException({ status: 'degraded' }),
      missingFields.host,
    );
    expect(missingFields.status).toHaveBeenCalledWith(503);
    expect(missingFields.json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: '일시적인 오류가 발생했습니다.',
    });

    const wrongPath = createHost('/api/other');
    filter.catch(
      new ServiceUnavailableException({
        status: 'degraded',
        db: 'down',
        redis: 'up',
      }),
      wrongPath.host,
    );
    expect(wrongPath.status).toHaveBeenCalledWith(503);
    expect(wrongPath.json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: '일시적인 오류가 발생했습니다.',
    });

    expect(errorSpy).toHaveBeenCalledTimes(2);
  });

  it('처리되지 않은 일반 Error는 500 INTERNAL_SERVER_ERROR로 감싸고 내부 메시지를 숨긴다', () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    const { host, status, json } = createHost();

    filter.catch(new Error('sensitive db connection string leaked'), host);

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      code: 'INTERNAL_SERVER_ERROR',
      message: '일시적인 오류가 발생했습니다.',
    });
  });
});
