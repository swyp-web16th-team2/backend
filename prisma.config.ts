import { defineConfig } from 'prisma/config';

// 로컬에서는 .env를 읽는다(없으면 건너뜀). 배포 환경은 실제 환경 변수를 쓴다.
try {
  process.loadEnvFile();
} catch {}

// 마이그레이션·DB 명령(migrate, db)에는 풀러를 거치지 않는 연결(DIRECT_URL)이 꼭 필요하다.
// DATABASE_URL(앱이 쓰는 트랜잭션 풀러)로 조용히 넘어가지 않도록, 없으면 연결하기 전에 실패시킨다.
// generate에는 URL이 필요 없다.
const needsDatabase = process.argv.some(
  (arg) => arg === 'migrate' || arg === 'db',
);
const directUrl = process.env.DIRECT_URL?.trim();
if (needsDatabase && !directUrl) {
  throw new Error(
    'DIRECT_URL이 필요합니다. 마이그레이션은 풀러를 거치지 않는 연결로 해야 합니다(README의 DB 항목 참고).',
  );
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: directUrl ?? '' },
});
