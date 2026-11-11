import type { INestApplication } from '@nestjs/common';

// 환경 변수 CORS_ORIGINS(쉼표로 구분)가 없으면 로컬 개발 주소(React CRA·Vite)만 허용한다.
const DEFAULT_ORIGINS = 'http://localhost:3000,http://localhost:5173';

export function corsOrigins(
  env: string | undefined = process.env.CORS_ORIGINS,
): string[] {
  return (env ?? DEFAULT_ORIGINS)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function setupCors(app: INestApplication, env?: string): void {
  app.enableCors({ origin: corsOrigins(env) });
}
