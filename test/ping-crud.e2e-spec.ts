import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/db/prisma.service.js';

// 임시 모델 Ping으로 Prisma의 입력·조회·수정·삭제를 실제 DB에 해 본다(SW2-69). 시험이 끝나면 모델과 함께 지운다.
// 실제 Postgres가 필요하다. DATABASE_URL이 없으면 건너뛴다.
describe.skipIf(!process.env.DATABASE_URL)(
  'Prisma CRUD (임시 Ping 모델)',
  () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
      }).compile();
      app = moduleRef.createNestApplication();
      await app.init();
      prisma = app.get(PrismaService);
    });

    afterAll(async () => {
      await app.close();
    });

    it('입력·조회·수정·삭제가 된다', async () => {
      const created = await prisma.ping.create({ data: { message: 'hello' } });
      expect(created.id).toBeGreaterThan(0);
      expect(created.createdAt).toBeInstanceOf(Date);

      const found = await prisma.ping.findUnique({ where: { id: created.id } });
      expect(found?.message).toBe('hello');

      const updated = await prisma.ping.update({
        where: { id: created.id },
        data: { message: 'world' },
      });
      expect(updated.message).toBe('world');

      const list = await prisma.ping.findMany({ where: { id: created.id } });
      expect(list).toHaveLength(1);

      await prisma.ping.delete({ where: { id: created.id } });
      expect(
        await prisma.ping.findUnique({ where: { id: created.id } }),
      ).toBeNull();
    });
  },
);
