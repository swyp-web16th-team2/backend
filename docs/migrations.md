# DB 마이그레이션 가이드

DB 구조(테이블·컬럼)를 바꾸는 일은 코드와 달리 **한 번 적용하면 되돌리기 어렵고, 팀원 모두의 DB에 같은 순서로 적용돼야** 합니다. 그래서 규칙을 정해 두었습니다. 이 문서의 "확인함"은 이 레포에서 로컬 DB로 직접 돌려 본 결과입니다.

## 한눈에

1. 모델을 바꾸면 **마이그레이션 파일을 만들어 코드와 같이 커밋**합니다. DB를 손으로 고치지 않습니다.
2. **이미 병합된 마이그레이션은 고치거나 지우지 않습니다.** 잘못됐으면 새 마이그레이션으로 고칩니다. (PR에서 CI가 막습니다)
3. 생성된 `migration.sql`은 **병합 전에 눈으로 읽습니다.** 특히 컬럼 삭제·이름 변경.
4. 운영(Supabase)에는 `npm run db:deploy`만 씁니다. `db:migrate`는 **로컬 DB 전용**입니다.

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

## 2. 위험한 변경은 SQL을 먼저 보고 고칩니다

Prisma가 만드는 SQL이 **의도와 다를 수 있습니다.**

| 하고 싶은 일 | Prisma가 만드는 것 | 해야 할 일 |
|---|---|---|
| 컬럼 **이름 바꾸기** | `DROP COLUMN` 뒤 `ADD COLUMN`(확인함). **그 컬럼의 데이터가 사라집니다.** | `--create-only`로 SQL만 만들고, 직접 `ALTER TABLE ... RENAME COLUMN ...`으로 고친 뒤 적용 |
| 컬럼 **삭제** | `DROP COLUMN`. SQL 맨 위에 "데이터가 사라진다"는 경고 주석 | 정말 지워도 되는지 확인. 아래 3단계 방식 권장 |
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
- **운영에서는 한 번에 지우지 말고 3단계로** 합니다. 새 코드를 배포하는 시점과 마이그레이션을 적용하는 시점이 다를 수 있어서, 어느 시점에도 옛 코드·새 코드가 모두 동작해야 합니다.
  1. **추가**: 새 컬럼·테이블을 추가하는 마이그레이션을 먼저 적용(옛 코드는 그대로 동작)
  2. **전환**: 코드가 새 컬럼을 쓰도록 배포하고, 필요하면 데이터를 옮김
  3. **정리**: 다음 PR에서 옛 컬럼 삭제

## 3. 하지 말 것

| 하지 말 것 | 왜 | 어떻게 되나 |
|---|---|---|
| **병합된 마이그레이션 파일을 고치거나 지우기·이름 바꾸기** | 이미 적용된 DB(팀원 로컬, 운영)와 파일이 어긋납니다 | **`migrate deploy`와 `migrate status`는 아무 경고 없이 "문제 없음"이라고 합니다**(확인함). `migrate dev`만 "modified after it was applied"라며 로컬 DB 초기화를 요구합니다. 그래서 PR에서 CI가 막습니다. 잘못된 마이그레이션은 **새 마이그레이션으로 고칩니다** |
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
- **새 코드보다 마이그레이션을 먼저** 적용합니다. 새 코드가 새 컬럼을 쓰는데 컬럼이 아직 없으면 오류가 납니다. 위 "3단계" 방식이면 순서가 어긋나도 안전합니다.

**지금(임시) 방식 — 팀이 정할 때까지**: 마이그레이션이 들어간 PR을 **병합한 사람이 직접** 운영 DB에 적용하고 Riido task에 "적용함"을 남깁니다.

```bash
# 운영 DIRECT_URL을 화면·셸 기록에 남기지 않고 한 번만 넣어서 실행합니다.
read -rs -p "운영 DIRECT_URL: " DIRECT_URL; echo
export DIRECT_URL
npx prisma migrate status    # 어떤 마이그레이션이 대기 중인지 먼저 확인
npm run db:deploy
unset DIRECT_URL
```

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
| `Drift detected` | 누군가 DB를 직접 바꿨습니다. 로컬은 초기화, 운영은 `migrate diff`로 차이를 확인한 뒤 **새 마이그레이션으로 맞춥니다** |
| 새 모델이 코드에서 안 보임 / 타입 오류 | `npm run db:generate`를 안 했습니다 |
| `Error: Prisma Migrate detected that it was invoked by Claude Code` | Prisma의 에이전트 안전장치입니다. 사람이 직접 실행하거나 동의합니다 |
