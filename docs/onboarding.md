# 온보딩 가이드

처음 합류했다면 이 문서만 따라 하면 됩니다. 로컬에서 서버를 띄우고 테스트가 통과하는 상태까지 만듭니다. 처음에는 Docker 이미지와 npm 패키지를 내려받느라 몇 분 걸릴 수 있고, 이미 받아 둔 제 PC에서는 15초쯤 걸렸습니다.

```bash
git clone https://github.com/swyp-web16th-team2/backend.git
cd backend
./scripts/setup.sh
```

## 1. 준비물

**계정**

- GitHub: 조직 `swyp-web16th-team2` 초대를 수락해 두세요. 초대 링크는 `https://github.com/orgs/swyp-web16th-team2/invitation`입니다. 수락하지 않으면 `git push`가 안 됩니다.
- Riido: 팀 `SW2`에 들어가 있어야 합니다. 작업 번호(`SW2-45` 같은 것)를 여기서 확인합니다.
- Supabase(선택): 운영 DB의 테이블을 눈으로 보고 싶을 때만 필요합니다. 로컬 개발에는 필요 없습니다.

**프로그램**

| 프로그램 | 버전 | 확인 |
|---|---|---|
| git | 아무거나 | `git --version` |
| Node.js | **22 이상** | `node -v` |
| Docker | Docker Desktop 최신(`docker compose` 명령이 되는 것) | `docker compose version` |

- Windows는 WSL2 안에서 실행하는 것을 권합니다. 이 스크립트는 bash가 필요합니다. Windows에서 실제로 돌려 보지는 않았습니다.
- Node는 nvm으로 맞추는 것을 권합니다: `nvm install 22 && nvm use 22`.
- Docker Desktop은 **켜 둔 상태**여야 합니다.

## 2. 설정

위의 세 줄을 실행하면 `scripts/setup.sh`가 아래를 차례로 합니다. 여러 번 실행해도 안전합니다.

1. 필요한 도구가 있는지, Node가 22 이상인지, Docker가 켜져 있는지 확인합니다. 없으면 이유를 알려 주고 멈춥니다.
2. `.env`가 없으면 `.env.example`을 복사해 만듭니다. 이미 있으면 그대로 둡니다.
3. 포트가 비어 있는지 봅니다. 5433(Postgres)이나 6380(Redis)을 다른 프로그램이 쓰고 있으면 비어 있는 다른 포트를 골라 `.env`에 적습니다.
4. `npm ci`로 의존성을 설치합니다.
5. `docker compose up -d --wait`로 로컬 Postgres와 Redis를 띄우고 준비될 때까지 기다립니다.
6. 로컬 DB에 마이그레이션을 적용하고, 단위 테스트와 e2e 테스트를 돌려 확인합니다.

끝나면 서버를 띄워 봅니다.

```bash
npm run start:dev                 # 서버 실행(코드를 고치면 자동 재시작)
curl localhost:3001/health        # {"status":"ok","db":"up","redis":"up"}가 나오면 정상
```

**이 스크립트는 운영 DB(Supabase)를 건드리지 않습니다.** 로컬 Postgres에만 연결하고, `.env`가 로컬이 아닌 주소를 가리키면 마이그레이션을 적용하지 않고 멈춥니다. 셸에 운영 주소가 `export`돼 있어도 스크립트 안에서는 지우고 실행합니다.

## 3. 매일 쓰는 명령

| 하고 싶은 일 | 명령 |
|---|---|
| 서버 실행 | `npm run start:dev` |
| 로컬 DB·Redis 켜기 / 끄기 | `docker compose up -d` / `docker compose down` |
| 로컬 DB 데이터까지 지우고 처음부터 | `docker compose down -v` 후 `./scripts/setup.sh` |
| 린트 / 타입 검사 / 빌드 | `npm run lint` / `npm run typecheck` / `npm run build` |
| 단위 테스트 / e2e 테스트 | `npm test` / `npm run test:e2e` |
| 모델 바꾼 뒤 마이그레이션 만들기 | `DIRECT_URL="postgresql://swyp:swyp@localhost:5433/swyp" npm run db:migrate -- --name <영문이름>` (포트는 `.env`의 값) |

DB 구조를 바꿀 때는 [마이그레이션 가이드](migrations.md)를 꼭 읽으세요. 위 명령처럼 로컬 주소를 명령에 직접 붙이는 이유도 거기에 있습니다.

## 4. 첫 PR까지

1. **Riido에서 task를 확인합니다.** 없으면 먼저 만들고 번호를 확인합니다.
2. **`main`에서 브랜치를 만듭니다.** 이름은 `<prefix>/SW2-<번호>-<영문 설명>`입니다. 예) `feature/SW2-45-space-invite-link`.
3. 코드를 고치고 `npm run lint`, `npm test`가 통과하는지 확인한 뒤 커밋합니다.
4. PR을 올립니다. 제목은 `[SW2-45] 내용`, 본문은 PR 양식을 채웁니다.
5. 병합은 **스쿼시 병합**이고 PR 작성자가 직접 합니다. `main`에는 직접 푸시할 수 없습니다.

브랜치 이름, 커밋 메시지, PR 규칙의 자세한 내용은 [CONTRIBUTING.md](../CONTRIBUTING.md)에 있습니다. 코드를 어디에 어떻게 짜는지는 [아키텍처 문서](architecture.md)를 보세요.

PR이 `main`에 병합되면 자동으로 이미지가 만들어져 서버에 배포됩니다. 배포를 직접 할 일은 없습니다.

## 5. 하지 말 것

- **운영 DB 주소를 `.env`에 넣거나 셸에 `export`하지 않습니다.** 로컬 명령이 운영 DB에 가게 됩니다.
- **Supabase 대시보드나 SQL로 테이블을 직접 바꾸지 않습니다.** 구조 변경은 마이그레이션 PR로만 합니다.
- **이미 병합된 마이그레이션 파일을 고치거나 지우지 않습니다.** CI가 막습니다. 잘못됐으면 새 마이그레이션을 추가합니다.
- **DB 비밀번호를 채팅이나 PR에 붙이지 않습니다.** 필요 없습니다. 로컬은 `swyp/swyp`이고, 운영 주소는 서버와 CI가 알아서 씁니다.
- `main`에 직접 푸시하지 않습니다. 브랜치는 항상 `main`에서 새로 만듭니다.

## 6. 막힐 때

| 증상 | 해결 |
|---|---|
| `Docker가 실행 중이 아닙니다` | Docker Desktop을 켜고 다시 실행합니다. |
| `Node 22 이상이 필요합니다` | `nvm install 22 && nvm use 22` 후 다시 실행합니다. |
| 포트가 겹친다는 메시지 | 스크립트가 알아서 다른 포트를 고르고 `.env`에 적습니다. 그래도 안 되면 `.env`의 `POSTGRES_PORT`, `REDIS_PORT`를 직접 바꿉니다. |
| `.env의 DIRECT_URL 가 로컬(localhost) 주소가 아닙니다` | `.env`를 지우고 스크립트를 다시 실행합니다. |
| `/health`에서 `db` 또는 `redis`가 `down` | `docker compose ps`로 컨테이너가 떠 있는지 봅니다. 꺼져 있으면 `docker compose up -d`. |
| 로컬 DB를 처음부터 다시 만들고 싶다 | `docker compose down -v` 후 `./scripts/setup.sh`. 로컬 데이터가 모두 사라집니다. |
| `P1001: Can't reach database server` | 로컬 Postgres가 안 떠 있거나 `.env`의 포트가 틀렸습니다. 위 두 줄을 확인합니다. |
| 위에 없는 오류 | 오류 메시지 전체를 복사해 팀 채팅에 올립니다. |

## 7. 운영 환경 알아 두기

- API 주소: `https://swyp16th.duckdns.org` (상태 확인은 `/health`).
- 운영 DB는 Supabase(서울 리전), 캐시 Redis는 서버(k3s)에서 돕니다. 로컬에서는 만질 일이 없습니다.
- 마이그레이션이 든 PR을 병합하면 운영 DB 적용이 **승인 대기**에 들어가고, 승인자가 승인해야 적용·배포됩니다([마이그레이션 가이드](migrations.md) 6절).
