import {
  Propagation,
  TransactionHost,
  Transactional,
} from '@nestjs-cls/transactional';
import type { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  Post,
  Req,
} from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { afterAll, afterEach, vi } from 'vitest';
import { z } from 'zod';
import { AppModule } from './../src/app.module.js';
import { AppException } from './../src/common/exceptions/app.exception.js';
import { ZodValidationPipe } from './../src/common/pipes/zod-validation.pipe.js';
import { PrismaService } from './../src/db/prisma.service.js';
import { setupApp } from './../src/setup-app.js';

const hasDb = Boolean(process.env.DATABASE_URL);

const testBodySchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(1, '닉네임을 입력해 주세요.')
    .max(8, '닉네임은 최대 8자입니다.'),
});

type TestBody = z.infer<typeof testBodySchema>;

class NestedSavepointRollbackError extends Error {
  constructor(readonly innerXid: string) {
    super('nested rollback signal');
  }
}

@Injectable()
class TestTxService {
  lastAbortedXid = '';

  constructor(
    @Inject(TransactionHost)
    private readonly txHost: TransactionHost<
      TransactionalAdapterPrisma<PrismaService>
    >,
  ) {}

  @Transactional()
  async readTwoXactIds(delaySeconds = 0): Promise<{
    active: boolean;
    first: string;
    second: string;
  }> {
    const active = this.txHost.isTransactionActive();
    const [row1] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;
    if (delaySeconds > 0) {
      await this.txHost.tx.$executeRaw`SELECT pg_sleep(${delaySeconds})`;
    }
    const [row2] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;
    return {
      active,
      first: row1?.xid ?? '',
      second: row2?.xid ?? '',
    };
  }

  @Transactional()
  async throwAfterAssigningXid(): Promise<never> {
    const [row] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;
    this.lastAbortedXid = row?.xid ?? '';
    throw new AppException(HttpStatus.CONFLICT, 'TX_ABORT_TEST', '롤백 테스트');
  }

  @Transactional()
  async readCurrentXid(): Promise<string> {
    const [row] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;
    return row?.xid ?? '';
  }

  @Transactional()
  async readNestedRequiredXids(): Promise<{
    outerXid: string;
    innerXid: string;
  }> {
    const [outerRow] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;
    const innerXid = await this.readCurrentXid();
    return {
      outerXid: outerRow?.xid ?? '',
      innerXid,
    };
  }

  @Transactional(Propagation.Nested)
  async insertInnerAndFail(): Promise<never> {
    const [row] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;
    await this.txHost.tx.$executeRawUnsafe(
      "INSERT INTO tx_savepoint_test (val) VALUES ('inner')",
    );
    throw new NestedSavepointRollbackError(row?.xid ?? '');
  }

  @Transactional()
  async nestedSavepointRollback(): Promise<{
    outerXid: string;
    innerXid: string;
    rows: string[];
  }> {
    await this.txHost.tx.$executeRawUnsafe(
      'CREATE TEMP TABLE IF NOT EXISTS tx_savepoint_test (val text) ON COMMIT DROP',
    );
    await this.txHost.tx.$executeRawUnsafe('DELETE FROM tx_savepoint_test');
    await this.txHost.tx.$executeRawUnsafe(
      "INSERT INTO tx_savepoint_test (val) VALUES ('outer')",
    );
    const [outerRow] = await this.txHost.tx.$queryRaw<{ xid: string }[]>`
      SELECT pg_current_xact_id()::text AS xid
    `;

    let innerXid = '';
    try {
      await this.insertInnerAndFail();
    } catch (error) {
      if (!(error instanceof NestedSavepointRollbackError)) {
        throw error;
      }
      innerXid = error.innerXid;
    }

    const rows = await this.txHost.tx.$queryRaw<{ val: string }[]>`
      SELECT val FROM tx_savepoint_test ORDER BY val
    `;
    return {
      outerXid: outerRow?.xid ?? '',
      innerXid,
      rows: rows.map((row) => row.val),
    };
  }
}

@Controller('test-foundation')
class TestFoundationController {
  constructor(
    @Inject(TestTxService) private readonly txService: TestTxService,
  ) {}

  @Get('cookie')
  readCookie(@Req() req: Request) {
    return {
      sessionKey:
        typeof req.cookies?.swyp_session === 'string'
          ? req.cookies.swyp_session
          : null,
    };
  }

  @Post('validate')
  validateBody(@Body(new ZodValidationPipe(testBodySchema)) body: TestBody) {
    return body;
  }

  @Get('app-error')
  throwAppError() {
    throw new AppException(
      HttpStatus.CONFLICT,
      'DUPLICATE_NICKNAME',
      '이미 사용 중인 닉네임입니다.',
    );
  }

  @Get('http-500')
  throwHttp500() {
    throw new InternalServerErrorException('secret connection string');
  }

  @Get('unhandled-error')
  throwUnhandledError() {
    throw new Error('internal secret details');
  }

  @Get('tx')
  checkTransaction() {
    return this.txService.readTwoXactIds();
  }

  @Get('tx-rollback')
  checkRollback() {
    return this.txService.throwAfterAssigningXid();
  }

  @Get('tx-nested-required')
  checkNestedRequired() {
    return this.txService.readNestedRequiredXids();
  }

  @Get('tx-concurrent')
  checkConcurrent() {
    return this.txService.readTwoXactIds(0.05);
  }

  @Get('tx-savepoint')
  checkSavepointRollback() {
    return this.txService.nestedSavepointRollback();
  }
}

describe('공통 API 기반 (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestFoundationController],
      providers: [TestTxService],
    }).compile();

    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/api 접두사로 마운트되고 접두사 없는 경로는 404를 반환한다', async () => {
    await request(app.getHttpServer())
      .get('/test-foundation/cookie')
      .expect(404);

    const missingApi = await request(app.getHttpServer()).get(
      '/api/test-foundation/missing',
    );
    expect(missingApi.status).toBe(404);
    expect(missingApi.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String),
    });

    await request(app.getHttpServer())
      .get('/api/test-foundation/cookie')
      .expect(200)
      .expect({ sessionKey: null });
  });

  it('Cookie 헤더의 swyp_session 값을 req.cookies로 파싱한다', async () => {
    await request(app.getHttpServer())
      .get('/api/test-foundation/cookie')
      .set('Cookie', ['swyp_session=sample-key'])
      .expect(200)
      .expect({ sessionKey: 'sample-key' });
  });

  it('ZodValidationPipe는 정상 요청을 변환 통과시키고 실패 시 400 VALIDATION_ERROR를 반환한다', async () => {
    await request(app.getHttpServer())
      .post('/api/test-foundation/validate')
      .send({ nickname: '  김스위프  ' })
      .expect(201)
      .expect({ nickname: '김스위프' });

    await request(app.getHttpServer())
      .post('/api/test-foundation/validate')
      .send({ nickname: '아홉글자넘는닉네임입니다' })
      .expect(400)
      .expect({
        code: 'VALIDATION_ERROR',
        message: '입력값이 올바르지 않습니다.',
        details: [
          {
            field: 'nickname',
            reason: '닉네임은 최대 8자입니다.',
          },
        ],
      });
  });

  it('AppException을 { code, message } 정확한 모양으로 응답한다', async () => {
    await request(app.getHttpServer())
      .get('/api/test-foundation/app-error')
      .expect(409)
      .expect({
        code: 'DUPLICATE_NICKNAME',
        message: '이미 사용 중인 닉네임입니다.',
      });
  });

  it('5xx HttpException은 내부 메시지를 숨기고 INTERNAL_SERVER_ERROR로 응답한다', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await request(app.getHttpServer())
      .get('/api/test-foundation/http-500')
      .expect(500)
      .expect({
        code: 'INTERNAL_SERVER_ERROR',
        message: '일시적인 오류가 발생했습니다.',
      });
  });

  it('처리되지 않은 예외는 500 INTERNAL_SERVER_ERROR로 응답하고 내부 메시지를 노출하지 않는다', async () => {
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    await request(app.getHttpServer())
      .get('/api/test-foundation/unhandled-error')
      .expect(500)
      .expect({
        code: 'INTERNAL_SERVER_ERROR',
        message: '일시적인 오류가 발생했습니다.',
      });
  });

  it.skipIf(!hasDb)(
    '실제 HTTP 요청 안에서 @Transactional()이 같은 DB 트랜잭션을 공유한다',
    async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-foundation/tx')
        .expect(200);

      expect(res.body.active).toBe(true);
      expect(typeof res.body.first).toBe('string');
      expect(res.body.first.length).toBeGreaterThan(0);
      expect(res.body.first).toBe(res.body.second);
    },
  );

  it.skipIf(!hasDb)(
    '@Transactional() 메서드에서 예외가 나면 DB 트랜잭션이 롤백된다',
    async () => {
      await request(app.getHttpServer())
        .get('/api/test-foundation/tx-rollback')
        .expect(409)
        .expect({
          code: 'TX_ABORT_TEST',
          message: '롤백 테스트',
        });

      const recordedXid = app.get(TestTxService).lastAbortedXid;
      expect(recordedXid.length).toBeGreaterThan(0);

      const [statusRow] = await app.get(PrismaService).$queryRaw<
        { status: string | null }[]
      >`
        SELECT pg_xact_status(CAST(${recordedXid} AS text)::xid8) AS status
      `;
      expect(statusRow?.status).toBe('aborted');
    },
  );

  it.skipIf(!hasDb)(
    '중첩된 @Transactional() Required 호출은 같은 DB 트랜잭션에 합류한다',
    async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-foundation/tx-nested-required')
        .expect(200);

      expect(typeof res.body.outerXid).toBe('string');
      expect(res.body.outerXid.length).toBeGreaterThan(0);
      expect(res.body.outerXid).toBe(res.body.innerXid);
    },
  );

  it.skipIf(!hasDb)(
    '동시 HTTP 요청은 각자 독립된 DB 트랜잭션으로 분리된다',
    async () => {
      const [res1, res2] = await Promise.all([
        request(app.getHttpServer())
          .get('/api/test-foundation/tx-concurrent')
          .expect(200),
        request(app.getHttpServer())
          .get('/api/test-foundation/tx-concurrent')
          .expect(200),
      ]);

      expect(res1.body.active).toBe(true);
      expect(res2.body.active).toBe(true);
      expect(res1.body.first).toBe(res1.body.second);
      expect(res2.body.first).toBe(res2.body.second);
      expect(res1.body.first).not.toBe(res2.body.first);
    },
  );

  it.skipIf(!hasDb)(
    '@Transactional(Propagation.Nested)는 savepoint 부분 롤백 후 바깥 트랜잭션을 커밋한다',
    async () => {
      const res = await request(app.getHttpServer())
        .get('/api/test-foundation/tx-savepoint')
        .expect(200);

      expect(typeof res.body.outerXid).toBe('string');
      expect(res.body.outerXid.length).toBeGreaterThan(0);
      expect(res.body.outerXid).toBe(res.body.innerXid);
      expect(res.body.rows).toEqual(['outer']);

      const [statusRow] = await app.get(PrismaService).$queryRaw<
        { status: string | null }[]
      >`
        SELECT pg_xact_status(CAST(${res.body.outerXid} AS text)::xid8) AS status
      `;
      expect(statusRow?.status).toBe('committed');
    },
  );
});
