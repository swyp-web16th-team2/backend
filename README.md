# backend

NestJS(TypeScript) 백엔드 서버입니다.

## 처음 시작하기

새로 합류했다면 아래 순서대로 하면 됩니다. 끝나면 로컬에서 서버가 뜨고 테스트가 통과합니다.

**1. 준비**

- GitHub 조직 `swyp-web16th-team2` 초대를 수락합니다: https://github.com/orgs/swyp-web16th-team2/invitation. 수락하기 전에는 push가 안 됩니다.
- Riido 팀 `SW2`에 들어가 있어야 합니다. 작업 번호(`SW2-45` 같은 것)는 거기서 봅니다.
- git, Node 22 이상, Docker Desktop이 필요합니다. Docker는 켜 둔 상태여야 합니다. Windows는 WSL2 안에서 실행하세요(Windows에서는 돌려 보지 않았습니다).

**2. 설정**

```bash
git clone https://github.com/swyp-web16th-team2/backend.git
cd backend
./scripts/setup.sh
```

스크립트가 하는 일은 이렇습니다.

1. 도구가 있는지, Node가 22 이상인지, Docker가 켜져 있는지 봅니다. 없으면 이유를 알려 주고 멈춥니다.
2. `.env`를 만듭니다. 이미 있으면 로컬 DB·Redis 주소, 포트, 이 폴더 전용 compose 프로젝트 이름 줄만 맞춰 씁니다.
3. 5433(Postgres)이나 6380(Redis)을 다른 프로그램이 쓰고 있으면 비어 있는 포트를 골라 `.env`에 적습니다.
4. `npm ci`로 설치하고 로컬 Postgres·Redis를 띄웁니다.
5. 로컬 DB에 마이그레이션을 적용하고 단위·e2e 테스트를 돌립니다.

운영 DB는 건드리지 않습니다. 셸에 운영 주소가 `export`돼 있어도 지우고 실행하고, `.env`의 DB 주소가 로컬이 아니면 마이그레이션 전에 멈춥니다. 여러 번 실행해도 괜찮습니다. 이미 받아 둔 환경에서는 15초쯤 걸렸고, 처음에는 Docker 이미지와 패키지를 내려받느라 더 걸립니다.

**3. 확인**

```bash
npm run start:dev               # 서버 실행. 이 터미널은 서버가 계속 쓰니 그대로 둡니다.
```

서버가 뜨면 **다른 터미널을 열어서** 확인합니다. 주소의 3001은 `.env`의 `PORT` 값입니다(바꿨다면 그 값).

```bash
curl localhost:3001/health      # {"status":"ok","db":"up","redis":"up"}
```

**4. 막힐 때**

- `Docker가 실행 중이 아닙니다`: Docker Desktop을 켜고 다시 실행합니다.
- `Node 22 이상이 필요합니다`: `nvm install 22 && nvm use 22` 후 다시 실행합니다.
- `.env의 DIRECT_URL 가 로컬(localhost) 주소가 아닙니다`: `.env`를 지우고 다시 실행합니다.
- `/health`에서 `db`나 `redis`가 `down`: `docker compose ps`로 컨테이너가 떠 있는지 봅니다. 꺼져 있으면 `docker compose up -d`.
- 로컬 DB를 처음부터 다시 만들고 싶을 때: `docker compose down -v` 후 `./scripts/setup.sh`. 로컬 데이터가 모두 사라집니다.
- 그 밖의 오류는 메시지 전체를 팀 채팅에 올립니다.

이어서 볼 문서: [온보딩 가이드](docs/onboarding.md)(위 내용의 자세한 판, 첫 PR까지의 순서, 하지 말 것), [CONTRIBUTING.md](CONTRIBUTING.md)(브랜치·커밋·PR 규칙), [아키텍처](docs/architecture.md), [마이그레이션 가이드](docs/migrations.md).

<details>
<summary>스크립트 없이 손으로 하려면</summary>

```bash
cp .env.example .env            # 로컬용 설정(.env는 git에 올라가지 않음)
docker compose up -d            # 로컬 Postgres(5433), Redis(6380)
npm install                     # Prisma 클라이언트도 같이 만들어 줌(postinstall)
npm run start:dev               # http://localhost:3001 (이 터미널은 서버가 계속 씁니다)
# 다른 터미널에서:
curl localhost:3001/health      # {"status":"ok","db":"up","redis":"up"}
```

- 포트는 `.env`의 `PORT`로 바꿉니다. React 개발 서버(3000)와 겹치지 않게 예시는 3001입니다.
- 이미 쓰는 로컬 DB·Redis와 겹치면 `POSTGRES_PORT`, `REDIS_PORT`로 compose 포트를 바꾸고 `.env`의 주소도 맞춥니다.
- 끄기: `docker compose down`, 데이터까지 지우기: `docker compose down -v`.
- 이 방법에서는 마이그레이션 적용과 테스트 확인을 직접 합니다(`DIRECT_URL`에 로컬 주소를 붙여 `npm run db:deploy`).

</details>

## DB (Prisma)

- 스키마는 `prisma/schema.prisma`에 모델을 추가하고 `npm run db:migrate`로 마이그레이션을 만듭니다(로컬 DB가 떠 있어야 함). 운영 DB에는 PR이 `main`에 병합될 때 CI가 승인자의 승인 뒤 자동으로 적용합니다([docs/migrations.md](docs/migrations.md) 6절).
- Supabase에서는 `DATABASE_URL`에 트랜잭션 풀러(6543, `?pgbouncer=true`), `DIRECT_URL`에 풀러를 거치지 않는 연결을 씁니다. 홈서버는 IPv6가 안 되어 IPv4가 되는 세션 풀러(5432)를 씁니다.
- `npm run db:migrate`·`db:deploy` 등 마이그레이션 명령은 `DIRECT_URL`이 없으면 연결하기 전에 실패합니다(앱용 트랜잭션 풀러로 마이그레이션이 가는 것을 막기 위해). `prisma generate`는 URL 없이 됩니다.
- `DATABASE_URL`·`REDIS_URL`이 없으면 서버는 뜨지만 `/health`가 해당 항목을 down으로 답합니다. 이때 `PGHOST` 같은 기본 환경 변수나 기본 포트(6379)의 다른 DB·Redis에 붙지 않습니다.
- **모델을 바꾸는 절차, 마이그레이션 규칙, 위험한 변경, 운영 적용 방법은 [docs/migrations.md](docs/migrations.md)**에 있습니다. 마이그레이션 파일은 한 번 병합하면 고치지 않습니다(CI가 막습니다).
- `prisma init`은 쓰지 마세요. 에이전트용 파일을 저장소에 만들어 버립니다.

## 구조

모듈 구성, 계층(Controller → Service → Repository), 폴더 구조, 열린 결정은 [docs/architecture.md](docs/architecture.md)에 있습니다(초안).

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
