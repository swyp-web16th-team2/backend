import { ClsPluginTransactional } from '@nestjs-cls/transactional';
import { TransactionalAdapterPrisma } from '@nestjs-cls/transactional-adapter-prisma';
import { Global, Module } from '@nestjs/common';
import { ClsModule } from 'nestjs-cls';
import { DbHealthService } from './db-health.service.js';
import { PrismaModule } from './prisma.module.js';
import { PrismaService } from './prisma.service.js';

@Global()
@Module({
  imports: [
    PrismaModule,
    ClsModule.forRoot({
      global: true,
      middleware: { mount: true },
      plugins: [
        new ClsPluginTransactional({
          imports: [PrismaModule],
          adapter: new TransactionalAdapterPrisma({
            prismaInjectionToken: PrismaService,
            sqlFlavor: 'postgresql',
          }),
        }),
      ],
    }),
  ],
  providers: [DbHealthService],
  exports: [PrismaModule, DbHealthService],
})
export class DbModule {}
