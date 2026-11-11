import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { setupCors } from './../src/cors.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    setupCors(app, 'http://localhost:5173,https://app.example.com');
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it('허용한 주소에서 부르면 CORS 헤더를 준다', () => {
    return request(app.getHttpServer())
      .get('/')
      .set('Origin', 'https://app.example.com')
      .expect(200)
      .expect('Access-Control-Allow-Origin', 'https://app.example.com');
  });

  it('허용하지 않은 주소에는 CORS 헤더를 주지 않는다', async () => {
    const res = await request(app.getHttpServer())
      .get('/')
      .set('Origin', 'https://evil.example');
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('허용한 주소의 사전 요청(OPTIONS)에 응답한다', () => {
    return request(app.getHttpServer())
      .options('/')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .expect(204)
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173');
  });

  afterEach(async () => {
    await app.close();
  });
});
