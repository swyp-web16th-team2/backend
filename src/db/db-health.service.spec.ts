import { afterEach, vi } from 'vitest';
import { DbHealthService } from './db-health.service.js';

describe('DbHealthService', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('DATABASE_URL이 없으면 PG* 환경 변수가 있어도 연결하지 않고 실패한다', async () => {
    vi.stubEnv('DATABASE_URL', '');
    // 다른 DB를 가리키는 기본 환경 변수가 있어도 쓰이면 안 된다(실제로는 아무 데도 열려 있지 않은 포트).
    vi.stubEnv('PGHOST', '127.0.0.1');
    vi.stubEnv('PGPORT', '5432');
    vi.stubEnv('PGUSER', 'x');
    vi.stubEnv('PGDATABASE', 'x');
    await expect(new DbHealthService().ping()).rejects.toThrow(
      'DATABASE_URL이 설정되지 않았습니다',
    );
  });

  it('공백뿐인 DATABASE_URL도 설정되지 않은 것으로 본다', async () => {
    vi.stubEnv('DATABASE_URL', '   ');
    await expect(new DbHealthService().ping()).rejects.toThrow(
      'DATABASE_URL이 설정되지 않았습니다',
    );
  });
});
