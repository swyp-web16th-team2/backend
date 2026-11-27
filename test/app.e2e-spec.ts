import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupApp } from './../src/setup-app.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupApp(app, {
      corsOriginsEnv: 'http://localhost:5173,https://app.example.com',
    });
    await app.init();
  });

  it('/ (GET)는 전역 /api 접두사에서 제외된다', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('허용한 주소에서 부르면 CORS와 Credentials 헤더를 준다', () => {
    return request(app.getHttpServer())
      .get('/')
      .set('Origin', 'https://app.example.com')
      .expect(200)
      .expect('Access-Control-Allow-Origin', 'https://app.example.com')
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('허용하지 않은 주소에는 CORS 헤더를 주지 않는다', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('허용한 주소의 사전 요청(OPTIONS)에 Credentials 헤더와 함께 응답한다', () => {
    return request(app.getHttpServer())
      .options('/')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173')
      .expect('Access-Control-Allow-Credentials', 'true');
  });

  it('존재하지 않는 /api 경로는 공통 404 에러 형식으로 응답한다', async () => {
    const res = await request(app.getHttpServer()).get('/api/not-found-test');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({
      code: 'NOT_FOUND',
      message: expect.any(String),
    });
  });

  afterEach(async () => {
    await app.close();
  });
});
