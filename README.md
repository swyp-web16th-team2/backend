# backend

NestJS(TypeScript) 백엔드 서버입니다.

## 로컬 실행

필요한 것: Node 22, Docker.

```bash
cp .env.example .env            # 로컬용 설정(.env는 git에 올라가지 않음)
docker compose up -d            # 로컬 Postgres(5433), Redis(6380)
npm install                     # Prisma 클라이언트도 같이 만들어 줌(postinstall)
npm run start:dev               # http://localhost:3001
curl localhost:3001/health      # {"status":"ok","db":"up","redis":"up"}
```

- 포트는 `.env`의 `PORT`로 바꿉니다. React 개발 서버(3000)와 겹치지 않게 예시는 3001입니다.
- 이미 쓰는 로컬 DB·Redis와 겹치면 `POSTGRES_PORT`, `REDIS_PORT`로 compose 포트를 바꾸고 `.env`의 주소도 맞춥니다.
- 끄기: `docker compose down`, 데이터까지 지우기: `docker compose down -v`.

## DB (Prisma)

- 스키마는 `prisma/schema.prisma`에 모델을 추가하고 `npm run db:migrate`로 마이그레이션을 만듭니다(로컬 DB가 떠 있어야 함). 배포 환경에는 `npm run db:deploy`로 적용합니다.
- Supabase에서는 `DATABASE_URL`에 트랜잭션 풀러(6543, `?pgbouncer=true`), `DIRECT_URL`에 풀러를 거치지 않는 연결을 씁니다. 홈서버는 IPv6가 안 되어 IPv4가 되는 세션 풀러(5432)를 씁니다.
- `npm run db:migrate`·`db:deploy` 등 마이그레이션 명령은 `DIRECT_URL`이 없으면 연결하기 전에 실패합니다(앱용 트랜잭션 풀러로 마이그레이션이 가는 것을 막기 위해). `prisma generate`는 URL 없이 됩니다.
- `DATABASE_URL`·`REDIS_URL`이 없으면 서버는 뜨지만 `/health`가 해당 항목을 down으로 답합니다. 이때 `PGHOST` 같은 기본 환경 변수나 기본 포트(6379)의 다른 DB·Redis에 붙지 않습니다.
- `prisma init`은 쓰지 마세요. 에이전트용 파일을 저장소에 만들어 버립니다.

## CORS

브라우저(React 등)에서 이 API를 부를 수 있는 주소는 환경 변수 `CORS_ORIGINS`(쉼표로 구분)로 정합니다. 없으면 로컬 개발 주소(`http://localhost:3000`, `http://localhost:5173`)만 허용합니다. 배포 환경의 값은 `infra` 레포 `apps/backend/deployment.yaml`에서 바꿉니다.

## 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `npm run build` | 빌드 (`dist/`) |
| `npm test` | 단위 테스트 |
| `npm run test:e2e` | e2e 테스트. `.env`(없으면 환경 변수)의 `DATABASE_URL`·`REDIS_URL`로 실제 DB·Redis 연결까지 확인하고, 둘 중 하나라도 없으면 그 테스트만 건너뜁니다 |
| `npm run lint` | 린트 |
| `npm run typecheck` | 테스트 포함 전체 타입 검사(Vitest·린트는 타입 오류를 못 잡음) |

## Docker

```bash
docker build -t backend .
docker run --rm -p 3000:3000 backend
```

## 이미지

`main`에 병합되면 GitHub Actions가 이미지를 `ghcr.io/swyp-web16th-team2/backend:<커밋 SHA>`로 올립니다. `latest` 태그는 쓰지 않습니다.

이어서 `infra` 레포의 이미지 태그를 같은 커밋 SHA로 자동으로 바꿔 커밋하고, Argo CD가 그것을 보고 홈서버 k3s에 배포합니다. (`infra`에 쓸 수 있는 배포 키가 Actions 시크릿 `INFRA_DEPLOY_KEY`에 있어야 합니다. 이 키로 CI가 `infra` 전체를 바꿀 수 있으므로 `main` 병합 때만 도는 `deploy` 작업에서만 씁니다.)

브랜치·커밋·PR 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다.
