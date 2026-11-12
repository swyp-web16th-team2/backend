# DB 마이그레이션 가이드

DB 구조(테이블·컬럼)를 바꾸는 일은 코드와 달리 **한 번 적용하면 되돌리기 어렵고, 팀원 모두의 DB에 같은 순서로 적용돼야** 합니다. 그래서 규칙을 정해 두었습니다. 이 문서의 "확인함"은 이 레포에서 로컬 DB로 직접 돌려 본 결과입니다.

## 한눈에

1. 모델을 바꾸면 **마이그레이션 파일을 만들어 코드와 같이 커밋**합니다. DB를 손으로 고치지 않습니다.
2. **이미 병합된 마이그레이션은 고치거나 지우지 않습니다.** 잘못됐으면 새 마이그레이션으로 고칩니다. (PR에서 CI가 막습니다)
3. 생성된 `migration.sql`은 **병합 전에 눈으로 읽습니다.** 특히 컬럼 삭제·이름 변경.
4. 운영(Supabase)에는 `npm run db:deploy`만 씁니다. `db:migrate`는 **로컬 DB 전용**입니다.
5. 마이그레이션을 **빠뜨리지 않았는지는 사람이 확인**합니다(1절). CI가 막는 것은 "이미 있는 마이그레이션을 고치거나 지우거나 이름을 바꾼 것"뿐입니다.

## 1. 모델을 바꾸는 절차 (로컬)

```bash
docker compose up -d                       # 로컬 Postgres (README의 로컬 실행 참고, .env 필요)
# 1) prisma/schema.prisma 수정
npm run db:migrate -- --name add_place     # 2) 마이그레이션 만들고 로컬 DB에 적용
# 3) prisma/migrations/<시각>_add_place/migration.sql 을 열어서 확인
npm run db:generate                        # 4) Prisma 클라이언트 다시 만들기
npm test && npm run test:e2e               # 5) 테스트
```

- **`db:generate`를 꼭 합니다.** Prisma 7에서는 `migrate dev`가 클라이언트를 자동으로 다시 만들지 않습니다(확인함: 마이그레이션 직후 `src/generated/prisma/models/`가 비어 있었고 `db:generate` 뒤에 `Place.ts`가 생김). 안 하면 새 모델이 코드에서 안 보입니다.
- 이름(`--name`)은 **영어 소문자와 밑줄**로 "무엇을 했는지"를 적습니다: `add_place`, `add_space_member`, `drop_place_area`. 폴더는 `20261112021812_add_place`처럼 `시각_이름`이 되고, **적용 순서는 이름순**입니다.
- **같이 커밋하는 것**: `prisma/schema.prisma` + 새 마이그레이션 폴더 + (처음 한 번) `prisma/migrations/migration_lock.toml`. 하나라도 빠지면 다른 사람 DB와 어긋납니다.
- PR 본문에 **이 PR이 DB를 어떻게 바꾸는지, 데이터가 사라지는 변경이 있는지** 한 줄 적습니다.
- 바뀐 게 없으면 `migrate dev`가 `Already in sync, no schema change or pending migration was found.`라고 하고 파일을 만들지 않습니다(확인함). 이 경우 마이그레이션 PR이 아닙니다.
- **마이그레이션을 빠뜨리지 않았는지**는 PR을 올리기 전에 이렇게 확인합니다. 파일을 만들지도 DB를 바꾸지도 않는 읽기 전용 명령입니다(확인함).
  ```bash
  npm run db:deploy      # 내 로컬 DB를 마이그레이션 최신 상태로 맞춘 뒤
  npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
  ```
  종료 코드 **0**(`No difference detected.`)이면 `schema.prisma`와 마이그레이션이 같습니다. **2**이면 마이그레이션에 없는 변경이 있는 것입니다(확인함: 컬럼을 추가하고 마이그레이션을 빠뜨리면 `Added column ...`과 함께 2). `--script`를 붙이면 필요한 SQL이 그대로 나옵니다. 그때는 1절의 `npm run db:migrate -- --name <의미 있는 이름>`으로 마이그레이션을 만듭니다. **CI는 이것을 잡지 못합니다**(확인함: `schema.prisma`만 바꾸고 마이그레이션을 빠뜨려도 통과. Prisma 7의 `migrate diff --from-migrations`는 `prisma.config.ts`에 shadow DB 설정이 필요해서 넣지 않았습니다).
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
npm run db:migrate -- --name rename_place_area --create-only   # 만들기만 하고 DB에는 적용하지 않음(확인함)
# migration.sql 의 DROP/ADD 를 아래처럼 직접 고친다
#   ALTER TABLE "Place" RENAME COLUMN "area" TO "district";
npm run db:deploy                                              # 고친 SQL을 로컬 DB에 적용(확인함: --create-only로 만든 것도 이 명령으로 적용됨)
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
npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code
# 마이그레이션 적용 상태
npx prisma migrate status
```

- **`migrate status`는 DB를 손으로 바꾼 것(drift)을 알려주지 않습니다**(확인함: "Database schema is up to date!"). 구조가 의심되면 위의 `migrate diff`를 쓰고, 로컬에서는 `npm run db:migrate`가 drift를 알려 줍니다.
- 로컬 DB를 처음부터 다시 만들기: `docker compose down -v` → `docker compose up -d` → `npm run db:deploy`(확인함: 빈 DB에서 마이그레이션이 전부 순서대로 적용됨). 로컬 데이터가 **모두 사라집니다.** (`npx prisma migrate reset`도 같은 일을 하는 공식 명령이며 직접 터미널에서 실행합니다.)
- AI 에이전트(Claude Code 등)로 개발할 때: Prisma 7은 에이전트가 `migrate reset` 같은 위험 명령을 실행하면 **사용자 동의 없이는 거부**합니다(확인함). 동의를 대신 넣어서 우회하지 말고 사람이 직접 판단해서 실행합니다.

## 6. 운영(Supabase)에 적용 — **결정 필요**

- **원칙**: PR이 `main`에 병합된 뒤 **`npm run db:deploy`(= `prisma migrate deploy`)만** 씁니다. 이 명령은 아직 적용 안 된 마이그레이션을 순서대로 적용하고, 되돌리는 기능은 없습니다(Prisma에는 down 마이그레이션이 없습니다). 되돌릴 때는 **새 마이그레이션을 앞으로 추가**합니다.
- **연결 주소**: 마이그레이션은 앱이 쓰는 트랜잭션 풀러(6543)가 아니라 **`DIRECT_URL`(세션 풀러, 5432)**로 합니다. 홈서버는 IPv6로 외부에 나가지 못해서 IPv4가 되는 세션 풀러를 씁니다. `DIRECT_URL`이 없으면 마이그레이션 명령은 연결하기 전에 실패합니다(확인함).
- **DB를 바꾸는 PR과 그 변경을 쓰는 코드 PR은 나눕니다.** 같은 PR에 넣으면 병합 직후(몇 분 안에) 자동 배포가 사람의 적용보다 먼저 일어나서, 새 코드가 아직 없는 컬럼을 쓰게 됩니다. 순서는 다음과 같습니다.
  1. **마이그레이션만 있는 PR**(하위 호환인 추가만)을 병합합니다. 자동 배포가 일어나도 코드가 그 컬럼을 쓰지 않으니 안전합니다.
  2. **운영에 적용하고 확인**합니다(아래 절차).
  3. 그 컬럼을 쓰는 **코드 PR**을 병합합니다.
  삭제·이름 변경·타입 변경은 2절처럼 더 잘게 나눠서, 옛 코드가 남아 있는 동안에는 적용하지 않습니다.

**지금(임시) 방식 — 팀이 정할 때까지**: 마이그레이션이 들어간 PR을 **병합한 사람이 직접** 운영 DB에 적용하고 Riido task에 "적용함"을 남깁니다.

```bash
# bash·zsh 모두 되는 형태입니다. 각 줄을 따로 실행하고, 2)의 출력을 읽어 판단한 뒤에만 3)으로 갑니다.
printf '운영 DIRECT_URL: '; read -rs PROD_DIRECT_URL; echo                 # 1) 주소 입력(화면·셸 기록에 남지 않음)
DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate status                   # 2) 대기 중인 마이그레이션 확인. 출력의 호스트가 운영 Supabase인지 사람이 확인
DIRECT_URL="$PROD_DIRECT_URL" npm run db:deploy                           # 3) 확인했으면 적용
unset PROD_DIRECT_URL                                                     # 4) 값 지우기
```

- **2)의 종료 코드로 판단하지 마세요.** `migrate status`는 대기 중인 마이그레이션이 있으면 정상이어도 **종료 코드 1**을 돌려줍니다(확인함). 출력으로 판단합니다.
  - `Following migration have not yet been applied`와 아직 적용 안 된 이름들이 나오면 → 3)으로 갑니다.
  - `Database schema is up to date!`이면 → 할 일이 없습니다.
  - 연결 오류, `Following migration have failed`(실패 기록), `Your local migration history and the migrations table from your database are different`(이력 불일치)가 나오면 → **멈추고** 팀에 알립니다(7절).
- 주소는 `export`하지 않고 **명령마다** `DIRECT_URL="..."`로만 넘깁니다. 그래서 값은 그 명령 하나의 환경에만 들어가고 `.env` 파일에는 기록되지 않습니다. 다만 입력한 값은 `unset` 전까지 그 셸의 변수에 남아 있습니다.
- **입력이 실패하거나 빈 값이면 `.env`의 로컬 주소로 대신 실행되지 않습니다**(확인함: 빈 값으로라도 정의된 환경 변수는 `.env`가 덮어쓰지 않고, 빈 `DIRECT_URL`이면 마이그레이션 명령이 연결 전에 실패합니다). 2)의 출력에서 호스트를 꼭 눈으로 확인합니다. 로컬(`localhost`)이면 멈춥니다.
- `export DIRECT_URL`로 쓰지 마세요. 입력이 실패했는데 변수가 정의되지 않은 상태라면 `.env`의 로컬 주소가 대신 쓰입니다(확인함).
- **Riido에 "운영 적용함"을 쓰는 것은 3)이 성공(`All migrations have been successfully applied`)한 것을 본 뒤에** 합니다.

| 방식 | 장점 | 단점 |
|---|---|---|
| 수동(지금) | 운영 DB 관리자 권한이 GitHub에 없음. 가장 단순 | 깜빡하면 새 코드가 DB보다 앞서가서 오류. 사람에 의존 |
| 병합 시 CI가 자동 적용 | 잊을 수 없음. 순서가 일정 | `DIRECT_URL`(DB 관리자 권한)을 GitHub Actions 시크릿으로 맡겨야 함 |
| 배포 때 k3s 작업으로 적용 | 서버 안에서 끝남 | 지금 운영 이미지에는 Prisma CLI가 없어서 이미지를 바꿔야 함 |

## 7. 자주 만나는 오류

| 메시지(일부) | 원인과 해결 |
|---|---|
| `DIRECT_URL이 필요합니다` | `.env`에 `DIRECT_URL`이 없습니다. `.env.example`을 참고해 넣습니다 |
| `The migration ... was modified after it was applied` | 적용된 마이그레이션 파일을 고쳤습니다. `git checkout`으로 원래대로 되돌리고 새 마이그레이션을 추가합니다 |
| `Error: P3009` / `Following migration have failed` | 이전에 적용하다 **중간에 실패한 마이그레이션이 DB에 "실패" 기록으로 남아 있어** 이후 `deploy`가 막힌 상태입니다(확인함). **먼저 DB가 부분적으로 적용된 상태인지, 데이터가 어떤지 확인**하세요. `resolve`는 SQL을 되돌리는 명령이 아니라 **기록만 바꿉니다.** DB를 손으로 원래대로 돌렸다면 `--rolled-back`, 손으로 끝까지 적용했다면 `--applied`로 정리합니다(`--rolled-back`으로 풀리는 것 확인함). **운영에서는 6절처럼 대상 주소를 명령마다 직접 넘기고** 출력의 호스트를 확인합니다: `DIRECT_URL="$PROD_DIRECT_URL" npx prisma migrate resolve --rolled-back "<마이그레이션 이름>"`. 주소를 빼면 `.env`의 **로컬 DB**의 기록을 바꾸게 되어 운영 문제는 그대로 남습니다. DB를 직접 건드리기 전에 팀에 먼저 알립니다 |
| `Drift detected` | 누군가 DB를 직접 바꿨습니다. 로컬은 초기화, 운영은 `migrate diff`로 차이를 확인한 뒤 **새 마이그레이션으로 맞춥니다** |
| 새 모델이 코드에서 안 보임 / 타입 오류 | `npm run db:generate`를 안 했습니다 |
| `Error: Prisma Migrate detected that it was invoked by Claude Code` | Prisma의 에이전트 안전장치입니다. 사람이 직접 실행하거나 동의합니다 |
