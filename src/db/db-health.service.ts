import net from 'node:net';
import { Injectable } from '@nestjs/common';
import { Client } from 'pg';
import { databaseUrl } from './database-url.js';

const TIMEOUT_MS = 2000;

// /health용 점검. 앱이 쓰는 연결 풀과 별개의 일회용 연결로 `SELECT 1`을 보낸다.
// 시간이 지나면 소켓을 끊어서 점검이 반드시 끝나게 한다(패킷이 조용히 사라져도 멈추지 않음).
// 앱 쿼리에는 클라이언트 쪽 제한 시간을 걸지 않는다: 시간 초과 에러가 나도 DB는 쿼리를 계속 실행해서,
// 쓰기라면 "실패로 보였지만 실제로는 커밋됨"이 되어 재시도 때 중복 쓰기가 생길 수 있기 때문이다.
@Injectable()
export class DbHealthService {
  async ping(): Promise<void> {
    const connectionString = databaseUrl();
    // 주소가 없으면 연결을 시도하지 않고 바로 실패시킨다(pg가 PGHOST 같은 기본 환경 변수로 다른 DB에 붙는 것을 막는다).
    if (!connectionString)
      throw new Error('DATABASE_URL이 설정되지 않았습니다');
    const socket = new net.Socket();
    const client = new Client({
      connectionString,
      stream: () => socket, // 점검이 끝나거나 시간이 지나면 이 소켓을 직접 끊기 위해 우리가 만든 소켓을 쓴다
      connectionTimeoutMillis: TIMEOUT_MS,
      query_timeout: TIMEOUT_MS,
    });
    // 소켓을 끊은 뒤에 올라오는 오류 이벤트가 프로세스를 죽이지 않게 한다.
    client.on('error', () => {});
    const timer = setTimeout(
      () => socket.destroy(new Error('DB 점검 시간 초과')),
      TIMEOUT_MS,
    );
    try {
      await client.connect();
      await client.query('SELECT 1');
    } finally {
      clearTimeout(timer);
      socket.destroy();
    }
  }
}
