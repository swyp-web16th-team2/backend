import { defineConfig } from 'vitest/config';

// 로컬에서는 .env를 읽는다(없으면 건너뜀). DB·Redis 연결 테스트가 이 값으로 실제 연결한다.
try {
  process.loadEnvFile();
} catch {}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
  },
});
