import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // 연결은 처음 쿼리할 때 맺는다. DATABASE_URL이 없거나 DB가 꺼져 있어도 서버는 뜨고 /health가 down으로 알려 준다.
    super({
      // 멈춘 연결이 영원히 남지 않게 시간 제한을 둔다.
      // - connectionTimeoutMillis: 연결을 못 맺으면 5초 뒤 실패
      // - query_timeout: 응답이 없는 쿼리는 10초 뒤 실패하고, 그 연결은 풀에서 버려진다(패킷이 조용히 사라진 경우 대비)
      // - keepAlive: 끊어진 연결을 운영체제가 더 빨리 알아채게 한다
      // statement_timeout은 Supabase 풀러가 시작 매개변수를 거부할 수 있어 쓰지 않는다.
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
        query_timeout: 10_000,
        keepAlive: true,
        keepAliveInitialDelayMillis: 10_000,
        idleTimeoutMillis: 30_000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
