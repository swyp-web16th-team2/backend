import net from 'node:net';
import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';

const hasServices = Boolean(process.env.DATABASE_URL && process.env.REDIS_URL);

// DB로 가는 길목에서 바이트를 조용히 버렸다가(연결은 유지) 다시 전달하는 프록시.
// NAT나 풀러가 연결을 끊고도 알려 주지 않는 상황을 흉내 낸다.
function startProxy(target: { host: string; port: number }) {
  let drop = false;
  const server = net.createServer((client) => {
    const upstream = net.connect(target.port, target.host);
    const close = () => {
      client.destroy();
      upstream.destroy();
    };
    client.on('data', (data) => {
      if (!drop) upstream.write(data);
    });
    upstream.on('data', (data) => client.write(data));
    client.on('error', close);
    upstream.on('error', close);
    client.on('close', close);
    upstream.on('close', close);
  });
  return {
    listen: () =>
      new Promise<number>((resolve) => {
        server.listen(0, '127.0.0.1', () =>
          resolve((server.address() as net.AddressInfo).port),
        );
      }),
    setDrop: (value: boolean) => {
      drop = value;
    },
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

describe.skipIf(!hasServices)('DB 연결이 조용히 끊겼다 복구될 때', () => {
  it('/health가 영영 down으로 남지 않고 복구된다', async () => {
    const original = process.env.DATABASE_URL as string;
    const real = new URL(original);
    const proxy = startProxy({
      host: real.hostname,
      port: Number(real.port || 5432),
    });
    const proxied = new URL(original);
    proxied.hostname = '127.0.0.1';
    proxied.port = String(await proxy.listen());
    process.env.DATABASE_URL = proxied.toString();

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    const app: INestApplication<App> = moduleRef.createNestApplication();
    await app.init();
    try {
      await request(app.getHttpServer()).get('/health').expect(200);

      proxy.setDrop(true);
      await request(app.getHttpServer()).get('/health').expect(503);

      proxy.setDrop(false);
      // 멈춘 쿼리는 query_timeout(10초)에 끝나고 그 연결은 버려져서, 새 연결로 복구돼야 한다.
      await vi.waitFor(
        async () => {
          await request(app.getHttpServer()).get('/health').expect(200);
        },
        { timeout: 25_000, interval: 1000 },
      );
    } finally {
      await app.close();
      await proxy.close();
      process.env.DATABASE_URL = original;
    }
  }, 45_000);
});
