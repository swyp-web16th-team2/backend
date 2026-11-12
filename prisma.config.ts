import { defineConfig } from 'prisma/config';

// 로컬에서는 .env를 읽는다(없으면 건너뜀). 배포 환경은 실제 환경 변수를 쓴다.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    // 마이그레이션은 풀러를 거치지 않는 직접(또는 세션) 연결(DIRECT_URL)을 쓴다. generate에는 URL이 필요 없다.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? '',
  },
});
