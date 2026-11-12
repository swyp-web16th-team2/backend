import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleDestroy {
  constructor() {
    // 연결은 처음 쿼리할 때 맺는다. DATABASE_URL이 없거나 DB가 꺼져 있어도 서버는 뜨고 /health가 down으로 알려 준다.
    super({
      // connectionTimeoutMillis: 연결을 못 맺으면 무한정 기다리지 않고 실패하게 한다.
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        connectionTimeoutMillis: 5000,
      }),
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
