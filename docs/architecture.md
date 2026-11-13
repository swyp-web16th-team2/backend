# 백엔드 아키텍처

이 문서는 **초안**입니다. 구조와 규칙은 정했고, PRD·ERD가 나와야 정해지는 것은 "열린 결정"(4절)으로 남겼습니다. 결정이 나면 이 문서를 고치는 PR로 확정합니다. 설명 중 "지금 있음"은 이 레포에 이미 있는 것이고, 나머지는 기능을 만들면서 생길 구조입니다.

## 1. 큰 틀

- NestJS **모듈형 모놀리스**입니다. 서버는 하나이고 기능별로 모듈을 나눕니다. 팀이 3명이라 서비스를 쪼개는 비용이 이득보다 큽니다.
- DB는 Supabase Postgres(Prisma로 접속), 캐시는 Redis(홈서버 k3s, 저장 없음)입니다. 배포는 `main` 병합으로 자동입니다([README](../README.md), [마이그레이션 가이드](migrations.md)).

## 2. 폴더 구조

```
src/
  main.ts, app.module.ts
  config/            환경 변수(지금은 env.ts, cors.ts가 src 바로 아래에 있음)
  infra/             기능과 무관한 연결: db(Prisma), redis, 외부 API 클라이언트
  common/            공통 필터·가드·데코레이터·파이프
  modules/
    <기능>/
      <기능>.module.ts
      <기능>.controller.ts     HTTP 입구
      <기능>.service.ts        업무 규칙
      <기능>.repository.ts     DB 접근. Prisma 결과를 엔티티로 바꿔 돌려줌
      <기능>.entity.ts         이 모듈이 정한 타입(Prisma와 무관)
      dto/                     요청 DTO와 응답 DTO
    health/                    (지금은 src/health에 있음)
  generated/prisma/            Prisma가 만든 클라이언트(git에 올리지 않음)
```

- 기능 모듈 후보: `congestion`(혼잡도 수집·조회), `place`(장소), `space`(스페이스: 초대 링크, 멤버·위치, 후보지, 투표). 실제 모듈은 PRD·ERD 뒤에 정합니다.
- 폴더는 **기능을 만들 때 만듭니다.** 빈 폴더를 미리 만들지 않습니다.
- 지금 `src/db`, `src/redis`, `src/health`는 위 구조로 옮기는 것을 다음 정리 작업으로 둡니다(동작은 그대로).

## 3. 계층과 규칙

```
Controller → Service → Repository → PrismaService(infra/db)
```

| 계층 | 하는 일 | 하지 않는 일 |
|---|---|---|
| Controller | 요청을 받고 요청 DTO로 검증, Service 호출, **엔티티를 응답 DTO로 바꿔** 응답 | 업무 규칙, DB 접근, 엔티티를 그대로 응답으로 내보내기 |
| Service | 업무 규칙, 여러 Repository 조합, 트랜잭션 경계. 엔티티만 다룸 | `PrismaService`나 Prisma 타입·클라이언트를 직접 쓰기 |
| Repository | 한 모델(묶음)의 조회·저장·삭제. **Prisma를 쓰는 유일한 곳**. Prisma 결과를 엔티티로 바꿔 반환 | 업무 규칙 |

- **Service는 Prisma를 직접 부르지 않습니다.** 서비스가 DB 라이브러리에 묶이지 않고, 단위 테스트에서 Repository만 흉내 내면 됩니다.
- Repository는 기능(모델 묶음)마다 하나씩 만들고, 모든 Repository가 상속하는 공통 베이스 클래스는 만들지 않습니다(처음에는 중복이 낫습니다).
- **Prisma 타입은 Repository 밖으로 나가지 않습니다.** Repository는 Prisma가 돌려준 결과를 이 모듈이 정한 엔티티 타입(`<기능>.entity.ts`)으로 바꿔서 반환합니다. 변환 함수는 Repository 파일 안에 두고, 모델마다 몇 줄입니다. 엔티티는 평범한 TypeScript 타입이고, 업무 메서드가 있는 클래스로는 키우지 않습니다(필요해지는 모듈에서만 올립니다).
- Prisma가 주는 `Date`, `Decimal`, enum 같은 타입은 Repository에서 엔티티가 정한 타입(문자열, 숫자, 문자열 유니온 등)으로 바꿉니다. 조회에 `include`를 쓰면 반환 타입이 Prisma 전용 타입이 되므로, 바꾼 결과에 `SpaceWithMembers` 같은 이름을 붙여 엔티티 파일에 둡니다.
- Prisma를 가져와도 되는 곳은 Repository(`*.repository.ts`), `db` 폴더(지금은 `src/db`, 옮긴 뒤에는 `infra/db`), 테스트, 생성된 클라이언트뿐입니다. `generated/prisma`, `@prisma/client`, `@prisma/adapter-pg`(하위 경로 포함), `PrismaService`를 그 밖에서 가져오면 oxlint(`.oxlintrc.json`의 `no-restricted-imports`)가 막고, `require`는 `no-require-imports`가 막습니다. oxlint가 못 보는 `import('...')` 타입 쿼리는 CI 단계 "Repository 밖에서 Prisma 타입 쿼리를 쓰지 않는지 확인"이 막습니다. 린트로 못 막는 것은 두 가지이고 리뷰에서 확인합니다. (1) Repository가 Prisma 타입을 자기 반환 타입으로 내보내 Service가 받아 쓰는 경우, (2) 파일 이름만 `.repository.ts`로 붙여 규칙을 피하는 경우.
- **API 응답은 엔티티와 별개인 응답 DTO**입니다. Controller가 엔티티를 응답 DTO로 바꿔 내보내므로, DB 컬럼 이름과 내부 컬럼(비밀번호 해시, 내부 관리용 값)이 응답에 새지 않고, DB 구조가 바뀌어도 API 모양은 그대로입니다. 엔티티를 응답 DTO 타입으로 겸용하지 않습니다. **응답 DTO는 필드를 하나씩 직접 적어서 만듭니다.** `{ ...entity }`나 `Object.assign`처럼 엔티티를 펼쳐 넣으면 안 됩니다. TypeScript 타입은 실행할 때 필드를 지우지 않아서, 펼쳐 넣으면 비밀번호 해시 같은 내부 필드가 실제 JSON에 그대로 나갑니다. 중첩된 객체와 배열 안의 항목도 같은 규칙입니다.
- 모듈끼리는 **Service(공개 메서드)로만** 부릅니다. 다른 모듈의 Repository나 테이블을 직접 건드리지 않습니다.
- **트랜잭션**: 여러 Repository에 걸친 쓰기는 Service에서 묶습니다. Repository 메서드는 선택 인자로 트랜잭션 핸들을 받을 수 있게 합니다. 핸들 타입은 `infra/db`가 이름 붙인 타입(`Tx`)으로 내보내서, Service가 Prisma 타입을 import하지 않고 그대로 넘기기만 하게 합니다. 실행 도우미와 `Tx` 타입은 처음 필요해질 때 `infra/db`에 만듭니다(지금은 만들지 않음).
- **쓰기에 제한 시간을 걸 때**의 주의는 `PrismaService`의 주석에 있습니다(클라이언트 쪽 시간 초과가 쓰기 중복을 만들 수 있음).

## 4. 열린 결정 (PRD·ERD 뒤에 확정)

| 결정 | 선택지 | 정해지면 달라지는 것 |
|---|---|---|
| 인증 | 가입 없이 닉네임·토큰(초대 링크 중심) / 로그인 | `auth` 모듈 유무, 스페이스 멤버 식별 방법 |
| 혼잡도 수집 | 서울시 API를 주기적으로 받아 DB에 저장 / 요청 때 불러 Redis에 짧게 캐시 | 스케줄러 필요 여부, 이력 테이블, API 호출 제한 대응 |
| 좌표 계산 | 위도·경도 컬럼과 간단한 거리 계산 / PostGIS | Prisma는 PostGIS 타입을 기본 지원하지 않아 후자는 직접 SQL(`$queryRaw`) 필요 |
| 실시간성 | 폴링 / SSE / WebSocket | 투표 현황·멤버 위치 갱신 방식, 서버 구성 |
| 요청 검증·직렬화 | `class-validator`+`class-transformer` / Zod 등 | DTO 작성 방식(지금은 어느 쪽도 설치돼 있지 않음) |
| API 형식 | 에러 응답 형식, 페이지네이션, 버전 접두사(`/v1`) | 프론트와 함께 정함(API 목록 정리 task에서) |

## 5. DB 규칙(제안)

- Prisma 모델 이름은 단수 파스칼 케이스(`Space`), 테이블·컬럼 이름은 snake_case(`@@map("space")`, `@map("created_at")`)로 맞춥니다. 복수형 여부는 첫 모델을 만들 때 한 번 정하고 그대로 씁니다.
- 모든 변경은 마이그레이션 PR로만 합니다. Supabase 대시보드나 MCP로 스키마를 직접 바꾸지 않습니다([가이드](migrations.md)).
- 운영 DB는 Data API를 끄고 서버(Prisma)로만 접근합니다.
- 운영 Supabase 프로젝트는 만들 때 "자동 RLS"를 켜서 `ensure_rls` 이벤트 트리거가 있고, 임시 테이블에서 실제로 RLS가 켜지는 것을 확인했습니다(2026-11-13). **이건 Supabase 프로젝트 설정이지 이 레포가 보장하는 것이 아닙니다.** 로컬 Postgres와 CI의 Postgres에는 없고, 프로젝트를 새로 만들면 다시 켜야 합니다. 그래서 RLS가 필요한 테이블은 이 설정에 기대지 말고 마이그레이션 SQL에 `ALTER TABLE ... ENABLE ROW LEVEL SECURITY`를 직접 적는 것을 원칙으로 합니다(Prisma 스키마로는 표현할 수 없어 `--create-only`로 SQL을 고칩니다. [가이드 2절](migrations.md)).

## 6. 테스트 방침

- **Service 단위 테스트**: Repository를 흉내 내서 업무 규칙만 확인합니다. DB 없이 빠르게 돕니다.
- **응답 모양 테스트**: 기능마다 e2e에서 응답이 의도한 필드만 가지는지 확인합니다(정확히 일치하는지 비교). 중첩 객체와 배열 항목까지 포함하고, 필드를 하나 더 내보내거나 빠뜨리면 실패합니다. 테스트 데이터에는 내부 컬럼에 값을 넣어 두고, 그 값이 응답에 없는지 함께 확인합니다.
- **Repository는 실제 DB로** e2e에서 확인합니다(로컬·CI의 Postgres). 흉내 낸 DB로는 쿼리 실수를 못 잡습니다.
- 운영 DB에 쓰는 테스트는 만들지 않습니다. 쓰기 테스트는 로컬 주소일 때만 돌게 막습니다(SW2-69에서 정한 방식).
