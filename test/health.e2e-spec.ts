import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/db/prisma.service.js';

// 실제 Postgres·Redis가 필요하다. DATABASE_URL과 REDIS_URL이 없으면 건너뛴다.
// 로컬: `docker compose up -d` 후 .env를 읽어 실행한다. CI는 서비스 컨테이너를 띄워 실행한다.
const hasServices = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);

describe.skipIf(!hasServices)('GET /health (실제 DB·Redis)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('앱이 쓰는 Prisma로도 실제 쿼리가 된다', async () => {
    const rows = await app.get(PrismaService).$queryRaw<
      { one: number }[]
    >`SELECT 1 AS one`;
    expect(rows[0]?.one).toBe(1);
  });

  it('DB와 Redis에 실제로 연결되면 ok', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up', redis: 'up' });
  });
});
