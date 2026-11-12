import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { DbHealthService } from '../db/db-health.service.js';
import { RedisService } from '../redis/redis.service.js';

const TIMEOUT_MS = 2000;

type State = 'up' | 'down';

@Controller('health')
export class HealthController {
  // 점검이 끝나기 전까지 이름을 기억한다. 연결이 멈춘 동안 /health가 반복 호출돼도 쿼리가 쌓이지 않게 하려는 것이다.
  private readonly running = new Set<string>();
  // 같은 순간에 들어온 요청들이 한 번의 점검 결과를 같이 쓰게 한다.
  private readonly shared = new Map<string, Promise<State>>();

  constructor(
    private readonly db: DbHealthService,
    private readonly redis: RedisService,
  ) {}

  private probe(name: string, check: () => Promise<unknown>): Promise<State> {
    const inFlight = this.shared.get(name);
    if (inFlight) return inFlight;
    // 이전 점검이 시간 제한을 넘기고도 아직 끝나지 않았다 = 연결이 멈춘 것. 새 점검을 시작하지 않고 바로 down으로 답한다.
    if (this.running.has(name)) return Promise.resolve('down');

    this.running.add(name);
    const done = Promise.resolve()
      .then(check)
      .then(
        () => 'up' as const,
        () => 'down' as const,
      )
      .finally(() => this.running.delete(name));
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<State>((resolve) => {
      timer = setTimeout(() => resolve('down'), TIMEOUT_MS);
    });
    const result = Promise.race([done, timeout]).finally(() => {
      clearTimeout(timer);
      this.shared.delete(name);
    });
    this.shared.set(name, result);
    return result;
  }

  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.probe('db', () => this.db.ping()),
      this.probe('redis', async () => {
        if ((await this.redis.ping()) !== 'PONG')
          throw new Error('PONG이 아님');
      }),
    ]);
    const body = {
      status: db === 'up' && redis === 'up' ? 'ok' : 'degraded',
      db,
      redis,
    };
    if (body.status !== 'ok') throw new ServiceUnavailableException(body);
    return body;
  }
}
