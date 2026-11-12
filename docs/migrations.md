# DB 마이그레이션 가이드

DB 구조(테이블·컬럼)를 바꾸는 일은 코드와 달리 **한 번 적용하면 되돌리기 어렵고, 팀원 모두의 DB에 같은 순서로 적용돼야** 합니다. 그래서 규칙을 정해 두었습니다. 이 문서의 "확인함"은 이 레포에서 로컬 DB로 직접 돌려 본 결과입니다.

## 한눈에

1. 모델을 바꾸면 **마이그레이션 파일을 만들어 코드와 같이 커밋**합니다. DB를 손으로 고치지 않습니다.
2. **이미 병합된 마이그레이션은 고치거나 지우지 않습니다.** 잘못됐으면 새 마이그레이션으로 고칩니다.
3. 생성된 `migration.sql`은 **병합 전에 눈으로 읽습니다.** 특히 컬럼 삭제·이름 변경.
4. 운영(Supabase)에는 PR이 `main`에 병합될 때 **CI가 `prisma migrate deploy`로 적용**합니다(승인자가 승인한 뒤, 6절). 사람이 운영 DB에 직접 명령을 칠 일은 장애 복구 때뿐입니다. `db:migrate`는 **로컬 DB 전용**입니다.
5. 마이그레이션을 **빠뜨리거나**, 이미 있는 마이그레이션을 **고치거나 지우거나 이름을 바꾸면** PR에서 CI가 막습니다(1절·3절).

> ⚠️ **셸에 `DIRECT_URL`이 export돼 있으면 `.env`의 로컬 주소보다 우선합니다**(코드 리뷰에서 재현됨). 운영 주소를 export한 셸에서 `npm run db:deploy` 같은 명령을 실행하면 **로컬이 아니라 운영 DB**에 적용됩니다. 그래서 운영 주소는 `export`하지 않고 명령마다 넘기며(6절), 로컬 DB를 지우거나 되돌리는 명령에는 로컬 주소를 직접 적습니다.

## 1. 모델을 바꾸는 절차 (로컬)

```bash
docker compose up -d                       # 로컬 Postgres (README의 로컬 실행 참고, .env 필요)
LOCAL_URL=postgresql://swyp:swyp@localhost:5433/swyp   # compose의 로컬 DB (POSTGRES_PORT를 바꿨다면 포트도 맞춥니다)
# 1) prisma/schema.prisma 수정
DIRECT_URL="$LOCAL_URL" npm run db:migrate -- --name add_place     # 2) 마이그레이션 만들고 로컬 DB에 적용
# 3) prisma/migrations/<시각>_add_place/migration.sql 을 열어서 확인
npm run db:generate                        # 4) Prisma 클라이언트 다시 만들기
npm test && npm run test:e2e               # 5) 테스트
```

- 로컬 DB를 건드리는 명령(`db:migrate`, `db:deploy`, `migrate diff`)에는 위 ⚠️ 때문에 `DIRECT_URL="$LOCAL_URL"`을 붙여 쓰는 것을 권합니다. `LOCAL_URL`은 새 셸마다 다시 정의해야 합니다. 출력의 호스트가 `localhost`인지 눈으로 확인하세요.
- **`db:generate`를 꼭 합니다.** Prisma 7에서는 `migrate dev`가 클라이언트를 자동으로 다시 만들지 않습니다(확인함: 마이그레이션 직후 `src/generated/prisma/models/`가 비어 있었고 `db:generate` 뒤에 `Place.ts`가 생김). 안 하면 새 모델이 코드에서 안 보입니다.
- 이름(`--name`)은 **영어 소문자와 밑줄**로 "무엇을 했는지"를 적습니다: `add_place`, `add_space_member`, `drop_place_area`. 폴더는 `20261112021812_add_place`처럼 `시각_이름`이 되고, **적용 순서는 이름순**입니다.
- **같이 커밋하는 것**: `prisma/schema.prisma` + 새 마이그레이션 폴더 + (처음 한 번) `prisma/migrations/migration_lock.toml`. 하나라도 빠지면 다른 사람 DB와 어긋납니다.
- PR 본문에 **이 PR이 DB를 어떻게 바꾸는지, 데이터가 사라지는 변경이 있는지** 한 줄 적습니다.
- 바뀐 게 없으면 `migrate dev`가 `Already in sync, no schema change or pending migration was found.`라고 하고 파일을 만들지 않습니다(확인함). 이 경우 마이그레이션 PR이 아닙니다.
- **마이그레이션을 빠뜨리지 않았는지는 CI가 확인합니다.** 깨끗한 DB를 새로 만들어 마이그레이션만 적용하고 `schema.prisma`와 비교해서, 빠뜨린 변경이 있으면 PR이 실패합니다(확인함: 모델만 추가하고 마이그레이션을 빠뜨린 첫 PR도 잡힘). PR을 올리기 전에 로컬에서 먼저 확인하려면, 로컬 DB를 깨끗하게 다시 만든 뒤 같은 비교를 합니다(**로컬 데이터가 사라집니다**).
  ```bash
  docker compose down -v && docker compose up -d   # 깨끗한 로컬 DB
  LOCAL_URL=postgresql://swyp:swyp@localhost:5433/swyp            # compose의 로컬 DB (POSTGRES_PORT를 바꿨다면 포트도 맞춥니다)
  DIRECT_URL="$LOCAL_URL" npm run db:deploy                       # 마이그레이션만으로 DB를 만들고
  DIRECT_URL="$LOCAL_URL" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
  ```
  두 명령에 같은 로컬 주소를 직접 넘기는 이유는 위 ⚠️ 때문입니다. 출력의 호스트가 `localhost`인지 눈으로 확인하세요. 종료 코드 **0**(`No difference detected.`)이면 같고, **2**이면 마이그레이션에 없는 변경이 있는 것입니다(`Added column ...`처럼 무엇이 빠졌는지 나옵니다. `--script`를 붙이면 필요한 SQL이 나옵니다). 그때는 1절의 `DIRECT_URL="$LOCAL_URL" npm run db:migrate -- --name <의미 있는 이름>`으로 마이그레이션을 만듭니다.
  - **깨끗하지 않은 DB에서 이 비교를 하면 빠뜨림을 놓칠 수 있습니다**(확인함: 로컬 DB에 손으로 컬럼을 추가하고 `schema.prisma`에도 추가했는데 마이그레이션은 없을 때, 현재 DB와 비교하면 종료 코드 0이 나오고 깨끗한 DB와 비교하면 2가 나옴. 코드 리뷰에서도 같은 결과). 위 로컬 확인은 반드시 `down -v` 뒤에 하세요.
- 주의: `migrate dev --create-only`는 **바뀐 게 없어도 빈 마이그레이션 폴더를 만듭니다**(확인함). "바뀐 게 있는지" 확인하는 용도로 쓰지 마세요. 또 `migrate dev`는 만든 마이그레이션을 **바로 적용**하므로, 적용된 뒤에는 폴더 이름을 바꾸지 못합니다(3절). 이름은 처음부터 알맞게 정합니다.

## 2. 위험한 변경은 SQL을 먼저 보고 고칩니다

Prisma가 만드는 SQL이 **의도와 다를 수 있습니다.**

| 하고 싶은 일 | Prisma가 만드는 것 | 해야 할 일 |
|---|---|---|
| 컬럼 **이름 바꾸기** | `DROP COLUMN` 뒤 `ADD COLUMN`(확인함). **그 컬럼의 데이터가 사라집니다.** | `--create-only`로 SQL만 만들고, 직접 `ALTER TABLE ... RENAME COLUMN ...`으로 고친 뒤 적용 |
| 컬럼 **삭제** | `DROP COLUMN`. SQL 맨 위에 "데이터가 사라진다"는 경고 주석 | 정말 지워도 되는지 확인. 아래 여러 PR로 나누는 방식 권장 |
| `NOT NULL` 컬럼 **추가** | 기존 행이 있으면 실패할 수 있음 | 기본값을 주거나, 먼저 nullable로 추가→값 채우기→`NOT NULL`로 변경 |
| 타입 변경 | 변환이 안 되면 실패하거나 데이터 손실 | 새 컬럼 추가→값 옮기기→옛 컬럼 삭제 |

**이름 바꾸기 예시** (확인한 흐름):

```bash
DIRECT_URL="$LOCAL_URL" npm run db:migrate -- --name rename_place_area --create-only   # 새로 만드는 마이그레이션만 적용하지 않음(확인함)
# 주의: --create-only도 이미 대기 중이던 다른 마이그레이션은 먼저 적용합니다(코드 리뷰에서 재현됨). 그래서 로컬 주소를 꼭 붙입니다.
# migration.sql 의 DROP/ADD 를 아래처럼 직접 고친다
#   ALTER TABLE "Place" RENAME COLUMN "area" TO "district";
DIRECT_URL="$LOCAL_URL" npm run db:deploy                       # 고친 SQL을 로컬 DB에 적용(확인함: --create-only로 만든 것도 이 명령으로 적용됨. LOCAL_URL은 1절)
```

- 직접 쓰는 터미널에서는 Prisma가 데이터 손실 변경에 확인을 물어볼 수 있습니다(이 환경에서는 확인하지 못함). 하지만 **CI·스크립트처럼 입력이 없는 환경에서는 확인 없이 적용됐습니다**(확인함: 컬럼 삭제 마이그레이션이 바로 적용됨). 그러니 SQL을 읽는 것은 사람이 합니다.
- **운영에서 컬럼·테이블을 없애거나 이름·타입을 바꿀 때는 한 번에 하지 말고 여러 PR로 나눕니다.** 새 코드를 배포하는 시점과 마이그레이션을 적용하는 시점이 다를 수 있고, 배포 중이나 롤백 때는 옛 코드와 새 코드가 같은 DB를 동시에 쓰기 때문입니다. 순서만 지킨다고 안전해지지는 않고, 각 단계의 조건을 지켜야 합니다.
  1. **추가**: 새 컬럼·테이블을 옛 코드가 영향받지 않는 형태(nullable 또는 기본값 있음)로 추가하는 마이그레이션을 먼저 적용합니다.
  2. **동시에 쓰기**: 코드가 옛 컬럼과 새 컬럼에 **둘 다 쓰도록** 배포합니다(읽기는 아직 옛 컬럼). 이 코드가 모든 쓰기 경로에 들어갔고 **옛 코드 인스턴스가 하나도 남지 않은 것을 확인한 뒤에** 3단계로 갑니다. 그러지 않으면 백필 뒤에도 옛 컬럼에만 쓰는 쓰기가 남아 두 값이 다시 어긋납니다.
  3. **옮기기와 확인**: 기존 데이터를 새 컬럼으로 옮기고(백필), 두 값이 같은지 확인합니다. 타입이 바뀌는 경우에는 단순 비교가 아니라 **변환을 거친 값끼리** 비교하고, 백필 도중에 들어온 쓰기가 있었는지 한 번 더 확인합니다.
  4. **읽기 전환**: 코드가 새 컬럼을 읽도록 배포합니다. 문제가 생기면 **2단계 코드(양쪽에 계속 쓰는 버전)까지만** 되돌립니다. 그보다 옛 버전으로 돌아가면 옛 컬럼에만 쓰게 되어 값이 다시 어긋나므로, 그때는 3단계(옮기기와 확인)를 다시 해야 합니다.
  5. **정리**: **옛 코드가 어디에도 남아 있지 않고 롤백할 일이 없을 때** 다음 PR에서 옛 컬럼을 지웁니다.
  - 이 순서는 일반 원칙입니다. 이 레포에서는 아직 한 번도 해 보지 않았고, 데이터가 거의 없는 지금 단계에서는 더 단순하게 가도 됩니다. 그래도 **운영에 데이터가 쌓인 뒤에는** 이 방식을 지킵니다.

## 3. 하지 말 것

| 하지 말 것 | 왜 | 어떻게 되나 |
|---|---|---|
| **병합된 마이그레이션 파일을 고치기** | 이미 적용된 DB(팀원 로컬, 운영)와 파일이 어긋납니다 | **`migrate deploy`·`migrate status`는 아무 경고 없이 "문제 없음"**(확인함). `migrate dev`만 "modified after it was applied"라며 로컬 DB 초기화를 요구합니다 |
| **병합된 마이그레이션 폴더를 지우기** | 위와 같습니다 | **`migrate deploy`·`migrate status`는 "문제 없음"**(확인함). `migrate dev`만 "Drift detected"로 알립니다 |
| **병합된 마이그레이션 폴더 이름 바꾸기** | 새 마이그레이션으로 취급됩니다 | `migrate status`는 "이력이 다르다"고 알리지만, **`migrate deploy`는 이름이 바뀐 것을 새 마이그레이션으로 보고 다시 적용하려다 실패**합니다(확인함: 컬럼이 이미 없어서 오류. 실패하면 아래 7절의 `P3009` 상태가 됩니다). 내용에 따라서는 같은 SQL이 두 번 적용될 수도 있습니다 |
| 운영 DB에 `db:migrate`(`migrate dev`), `migrate reset`, `db push` | 이력 없이 구조를 바꾸거나 DB를 지웁니다 | 운영은 `db:deploy`만 |
| Supabase 대시보드·SQL 편집기에서 **구조를 직접 수정** | 마이그레이션 이력과 실제 DB가 어긋납니다(drift) | `migrate status`는 못 잡고(확인함) `migrate dev`는 "Drift detected"로 초기화를 요구합니다 |
| `prisma init` | 에이전트용 파일 수십 개를 저장소에 만듭니다 | 쓰지 않습니다 |

## 4. 팀원끼리 겹칠 때

- 적용 순서는 폴더 이름의 시각순입니다. 두 사람이 각자 브랜치에서 마이그레이션을 만들면 병합 뒤에 둘 다 시각순으로 적용됩니다.
- **병합 전에** 서로 같은 테이블·컬럼을 건드렸는지 확인합니다. 겹치면 둘째 PR 작성자가 최신 `main`을 받은 뒤 **자기 브랜치의 마이그레이션을 다시 만듭니다**(아직 병합 전이므로 지우고 다시 만들어도 됩니다). 병합된 뒤에는 위 규칙대로 새 마이그레이션만 추가합니다.
- 마이그레이션이 들어간 PR은 가능하면 **한 번에 한 사람의 것만** 병합 대기시킵니다. (이 항목은 일반 원칙이고, 이 레포에서 아직 겪은 적은 없습니다.)

## 5. 로컬 DB 상태 확인·초기화

```bash
# 스키마 파일과 실제 로컬 DB가 다른지 (종료 코드 0=같음, 2=다름. 둘 다 확인함)
DIRECT_URL="$LOCAL_URL" npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
# 마이그레이션 적용 상태
DIRECT_URL="$LOCAL_URL" npx prisma migrate status
```

- **`migrate status`는 DB를 손으로 바꾼 것(drift)을 알려주지 않습니다**(확인함: "Database schema is up to date!"). 구조가 의심되면 위의 `migrate diff`를 쓰고, 로컬에서는 `DIRECT_URL="$LOCAL_URL" npm run db:migrate`가 drift를 알려 줍니다.
- 로컬 DB를 처음부터 다시 만들기: `docker compose down -v` → `docker compose up -d` → `DIRECT_URL="$LOCAL_URL" npm run db:deploy`(`LOCAL_URL`은 1절의 로컬 주소. 확인함: 빈 DB에서 마이그레이션이 전부 순서대로 적용됨). 로컬 데이터가 **모두 사라집니다.** (`migrate reset`이라는 공식 명령도 있지만 이 가이드에서는 시험하지 않았고, 위 Compose 방법으로 충분합니다. 쓰려면 반드시 `DIRECT_URL="$LOCAL_URL" npx prisma migrate reset`처럼 로컬 주소를 붙여 직접 터미널에서 실행합니다.)
- **`npx prisma`는 레포에 설치된 버전(7.10.1)을 써야 합니다.** `npm install`을 하지 않은 폴더에서 실행하면 npm의 **최신 버전**을 받아 실행하는데, 그 버전(8.0 rc)에서는 `migrate diff`가 다른 명령으로 옮겨졌다는 안내가 나왔습니다(확인함). Prisma를 올릴 때는 이 문서의 명령을 모두 다시 확인합니다.
- AI 에이전트(Claude Code 등)로 개발할 때: Prisma 7은 에이전트가 `migrate reset` 같은 위험 명령을 실행하면 **사용자 동의 없이는 거부**합니다(확인함). 동의를 대신 넣어서 우회하지 말고 사람이 직접 판단해서 실행합니다.

## 6. 운영(Supabase)에 적용 — 병합하면 CI가 승인 후 자동 적용합니다

2026-11-12에 정한 방식입니다(수동, CI 자동, k3s 작업 중 CI 자동을 고르고, 위험을 줄이려고 사람 승인을 넣음).

**흐름** (`.github/workflows/ci.yml`)
1. PR을 `main`에 병합하면 `check`·`image`·`publish`가 돕니다.
2. `migrate-plan`이 **지금 배포된 커밋**(infra 레포 `deployment.yaml`에 적힌 이미지 태그)과 이번 커밋을 비교해 `prisma/migrations`가 달라졌는지 봅니다. DB 접속 정보는 쓰지 않습니다.
3. 달라졌으면 `migrate`가 **승인 대기**에 들어갑니다. 달라지지 않았으면 건너뛰고 바로 `deploy`로 갑니다(승인 없이 지금처럼 배포됨).
4. 승인자가 Actions 실행 화면의 **Review deployments**에서 `production`을 승인하면 `npx prisma migrate deploy`가 운영 DB에 적용됩니다.
5. `migrate`가 **성공해야 `deploy`가 돕니다.** 실패하거나 승인하지 않으면(거절·대기) 새 버전은 배포되지 않고, 지금 돌고 있는 버전이 그대로 유지됩니다.

**승인자가 볼 것**: 승인하면 **아직 적용 안 된 마이그레이션이 모두** 적용됩니다(이번 병합의 것뿐 아니라 앞선 병합에서 대기·거절·실패로 남은 것도). 그 SQL 전체가 이 실행의 `migrate-plan` 작업 **요약(Summary) 화면**에 나옵니다(자르지 않고 전체를 보여 줍니다. 요약이 약 900KB를 넘으면 다 담을 수 없어 `migrate-plan`이 실패하고 배포가 멈추니, 그때는 사람이 처리합니다). 그 화면의 SQL을 읽고 승인합니다. 컬럼·테이블 삭제(`DROP`), 이름 변경(`DROP`+`ADD`로 나옴), 타입 변경, 큰 테이블 잠금이 있으면 승인하지 않고 팀과 먼저 상의합니다(2절). 승인자는 지금 `labyrinth30` 한 명이고, 레포 Settings > Environments > production에서 바꿉니다.

**설정(한 번만, 사람이 합니다)**
- `production` 환경은 만들어져 있고, 승인자 필수이며 `main` 브랜치에서만 쓸 수 있게 제한되어 있습니다.
- **환경 시크릿 `DIRECT_URL`**을 레포 Settings > Environments > production > Environment secrets에 넣어야 합니다. 값은 Supabase Connect 화면의 **Session pooler**(포트 5432) 주소에 비밀번호를 넣은 것입니다. 앱이 쓰는 Transaction pooler(6543)가 아닙니다. 홈서버뿐 아니라 GitHub 러너도 IPv4라서 세션 풀러를 씁니다. 시크릿이 없으면 `migrate`가 이유를 출력하고 실패합니다.
- 이 값은 DB 관리자 권한입니다. 채팅·PR 본문·로그에 붙이지 않습니다. 비밀번호를 바꿨다면 홈서버 시크릿 `backend-db`와 이 시크릿을 **둘 다** 바꿉니다.

**알아 둘 점**
- **되돌리기는 없습니다.** Prisma에는 down 마이그레이션이 없습니다. DB는 새 코드보다 먼저 바뀌므로, 새 코드를 롤백해도 **스키마는 그대로 앞서 있습니다.** 그래서 변경은 하위 호환으로 나눕니다(추가 → 코드 전환 → 삭제, 2절). 잘못 적용했으면 **새 마이그레이션을 앞으로 추가**합니다.
- 이번 병합 사이에 아직 배포 안 된 앞선 마이그레이션이 있으면 그것도 함께 적용 대상이 됩니다(비교 기준이 "지금 배포된 커밋"이라서). 앞선 병합의 `migrate`가 대기 중이면 뒤따르는 병합도 같이 승인 대기에 들어갑니다.
- 배포된 커밋을 읽지 못하는 등 판단이 안 서면 적용 쪽(승인 대기)으로 기웁니다. 승인했는데 적용할 게 없으면 "No pending migrations"로 끝납니다.
- 운영에는 별도 스테이징이 없어서 승인 즉시 운영 DB가 바뀝니다. 첫 마이그레이션은 작게(테이블 추가 정도로) 시작합니다.
- **확인 범위**: 판단 로직(`migrate-plan`)은 여러 git 상황으로 로컬에서 시험했고, `npm ci --ignore-scripts` 뒤 `prisma migrate deploy`가 임시 Postgres에서 적용되는 것도 확인했습니다. 실제 GitHub Actions의 승인 대기, 요약 화면에 SQL이 나오는 것, 실제 Supabase 세션 풀러 접속은 첫 마이그레이션 PR에서 처음 실행됩니다.

**사람이 운영 DB에 직접 명령을 쳐야 할 때**(장애 복구, `P3009` 해소 등)의 확인 사항입니다. 모두 로컬 DB로 확인했고, 실제 Supabase에서는 아직 확인하지 못했습니다.
1. **작업 트리가 깨끗하고 최신 `main`인지**: `git status --porcelain`이 비어 있고(추적·미추적 파일 모두) `git fetch origin main && git rev-parse HEAD origin/main`이 같아야 합니다. `status`와 `deploy`는 커밋이 아니라 **현재 작업 트리의 파일**을 읽기 때문에, 오래된 작업 트리에서는 최신 마이그레이션이 빠진 채 "성공"하고, 수정되었거나 추적 안 되는 SQL이 그대로 운영에 적용될 수 있습니다.
2. **운영 주소를 `export`하지 말고 명령마다 `DIRECT_URL="..."`로 넘깁니다.** 셸에 export된 값은 `.env`보다 우선하고, 반대로 입력이 실패해 변수가 **정의되지 않은 채** `export`만 하면 `.env`의 **로컬 주소가 대신 쓰입니다**(빈 값으로라도 정의된 변수는 `.env`가 덮어쓰지 않고 연결 전에 실패합니다). 입력은 `printf '...'; read -rs VAR`처럼 bash·zsh 모두 되는 형태로 합니다(`read -rs -p`는 zsh에서 실패).
3. **출력의 호스트를 사람이 확인**합니다(`... at "host:port"` 줄). 운영 Supabase가 아니면 멈춥니다.
4. **`migrate status`는 종료 코드로 판단하지 않습니다.** 대기 중인 마이그레이션이 있으면 정상이어도 종료 코드 **1**입니다. 그리고 실패 기록이 남은 DB에서는 뒤따르는 대기분만 보여 주고 실패 기록은 안 보여 줄 수 있습니다. 실패 기록이 있으면 `deploy`가 아무것도 적용하지 않고 `P3009`로 멈춥니다.
5. **적용 뒤 `status`가 `Database schema is up to date!`여도 작업 트리가 최신이라는 증명이 아닙니다.** 1번이 따로 필요합니다.
6. "운영에 적용함" 기록은 위가 모두 끝난 뒤에 남깁니다.

## 7. 자주 만나는 오류

| 메시지(일부) | 원인과 해결 |
|---|---|
| `DIRECT_URL이 필요합니다` | `.env`에 `DIRECT_URL`이 없습니다. `.env.example`을 참고해 넣습니다 |
| `The migration ... was modified after it was applied` | 적용된 마이그레이션 파일을 고쳤습니다. `git checkout`으로 원래대로 되돌리고 새 마이그레이션을 추가합니다 |
| `Error: P3009` / `Following migration have failed` | 이전에 적용하다 **중간에 실패한 마이그레이션이 DB에 "실패" 기록으로 남아 있어** 이후 `deploy`가 막힌 상태입니다(확인함). **실패한 마이그레이션 이름은 `deploy`가 `P3009`와 함께 출력한 이름**에서 봅니다(`status`는 뒤따르는 대기분이 있으면 실패 이름을 안 보여 줄 수 있음). 먼저 **DB가 부분적으로 적용된 상태인지, 데이터가 어떤지 확인**하세요. `migrate resolve --rolled-back`(원래대로 돌렸을 때)·`--applied`(손으로 끝까지 적용했을 때)는 SQL을 되돌리지 않고 **기록만 바꾸며, 실행하고 나면 취소하기 어렵습니다**(확인함: 로컬에서 `--rolled-back`으로 풀림, 코드 리뷰에서 재현됨: 일부 SQL이 적용된 채로도 기록은 바로 바뀜). **운영에서는 혼자 하지 말고 팀과 먼저 상의**하고, 명령마다 대상 주소를 직접 넘겨서(6절 2번) 로컬 DB의 기록을 바꾸지 않게 합니다 |
| `Drift detected` | 누군가 DB를 직접 바꿨습니다. **로컬**은 초기화(5절)로 됩니다. **운영**은 혼자 고치지 말고 팀과 먼저 상의합니다. 실제 DB 구조·데이터와 마이그레이션 이력을 비교(`migrate diff`)해서 차이를 파악한 뒤, 어떤 SQL과 어떤 이력 정리가 필요한지 사람이 정합니다. **새 마이그레이션이 항상 안전한 해결책은 아닙니다**(코드 리뷰에서 재현됨: 운영에 이미 있는 컬럼을 이력에 반영하려고 깨끗한 DB 기준으로 만든 새 마이그레이션은 `ADD COLUMN`이라서, 운영에 적용하면 이미 있는 컬럼 때문에 `deploy`가 실패하고 실패 기록이 남습니다) |
| 새 모델이 코드에서 안 보임 / 타입 오류 | `npm run db:generate`를 안 했습니다 |
| `Error: Prisma Migrate detected that it was invoked by Claude Code` | Prisma의 에이전트 안전장치입니다. 사람이 직접 실행하거나 동의합니다 |
