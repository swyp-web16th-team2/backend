import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

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

  it('DB와 Redis에 실제로 연결되면 ok', async () => {
    await request(app.getHttpServer())
      .get('/health')
      .expect(200)
      .expect({ status: 'ok', db: 'up', redis: 'up' });
  });
});
