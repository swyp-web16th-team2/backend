import { Global, Module } from '@nestjs/common';
import { DbHealthService } from './db-health.service.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  providers: [PrismaService, DbHealthService],
  exports: [PrismaService, DbHealthService],
})
export class DbModule {}
