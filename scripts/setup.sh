#!/usr/bin/env bash
# 로컬 개발환경을 한 번에 설정한다. 여러 번 실행해도 안전하다.
# 하는 일: 도구 확인 → .env 만들기 → 포트 충돌 피하기 → 의존성 설치 → 로컬 Postgres·Redis 실행 → 마이그레이션 적용 → 테스트로 확인
# 운영(Supabase) 주소는 쓰지 않는다. 자세한 설명은 docs/onboarding.md.

# `sh scripts/setup.sh`로 실행해도 되도록 bash로 다시 실행한다(pipefail 등이 필요).
if [ -z "${BASH_VERSION:-}" ]; then exec bash "$0" "$@"; fi

set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\n==> %s\n' "$*"; }
die() { printf '\n[중단] %s\n' "$*" >&2; exit 1; }

# 셸에 운영 주소가 export돼 있으면 .env의 로컬 주소보다 우선해서 운영 DB에 명령이 갈 수 있다(docs/migrations.md).
# 그래서 이 스크립트 안에서는 관련 환경 변수를 모두 지운다.
unset DATABASE_URL DIRECT_URL REDIS_URL PGHOST PGPORT PGUSER PGPASSWORD PGDATABASE

say "1/6 필요한 도구 확인"
for c in git node npm docker; do
  command -v "$c" >/dev/null 2>&1 || die "$c 가 설치되어 있지 않습니다. docs/onboarding.md의 '준비물'을 먼저 확인하세요."
done
node_major=$(node -p 'process.versions.node.split(".")[0]')
[ "$node_major" -ge 22 ] || die "Node 22 이상이 필요합니다(지금 $(node -v)). nvm을 쓴다면 'nvm install 22 && nvm use 22' 후 다시 실행하세요."
docker compose version >/dev/null 2>&1 || die "'docker compose' 명령이 없습니다. Docker Desktop을 최신으로 설치하거나 compose v2 플러그인을 설치하세요."
docker info >/dev/null 2>&1 || die "Docker가 실행 중이 아닙니다. Docker Desktop을 켠 뒤 다시 실행하세요."
echo "node $(node -v), npm $(npm -v), $(docker compose version --short 2>/dev/null || echo compose)"

say "2/6 .env 준비"
if [ -f .env ]; then
  echo ".env가 이미 있어서 그대로 씁니다."
else
  cp .env.example .env
  echo ".env.example을 복사해 .env를 만들었습니다."
fi

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- || true; }
env_set() { # 키가 있으면 값을 바꾸고 없으면 맨 아래에 추가한다. macOS·Linux sed 차이를 피하려고 임시 파일을 쓴다.
  local tmp; tmp=$(mktemp)
  if grep -qE "^$1=" .env; then sed "s|^$1=.*|$1=$2|" .env > "$tmp"; else { cat .env; echo "$1=$2"; } > "$tmp"; fi
  cat "$tmp" > .env; rm -f "$tmp"
}
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
our_service_running() { [ -n "$(docker compose ps --status running -q "$1" 2>/dev/null)" ]; }
free_port_from() { local p=$1; while port_busy "$p"; do p=$((p + 1)); [ "$p" -lt $(($1 + 50)) ] || die "비어 있는 포트를 못 찾았습니다($1~$p)."; done; echo "$p"; }

# 이 스크립트는 로컬용이다. .env가 로컬이 아닌 DB를 가리키면 마이그레이션을 적용하지 않고 멈춘다.
for k in DATABASE_URL DIRECT_URL; do
  case "$(env_get "$k")" in
    postgresql://*@localhost:*|postgresql://*@127.0.0.1:*) ;;
    *) die ".env의 $k 가 로컬(localhost) 주소가 아닙니다. 운영 주소는 .env에 넣지 않습니다. .env를 지우고 다시 실행하거나 $k 를 로컬 주소로 고치세요." ;;
  esac
done

say "3/6 포트 확인"
pg_port=$(env_get POSTGRES_PORT); pg_port=${pg_port:-5433}
redis_port=$(env_get REDIS_PORT); redis_port=${redis_port:-6380}
if our_service_running postgres; then
  echo "Postgres는 이미 이 프로젝트의 컨테이너가 실행 중입니다(포트 $pg_port)."
elif port_busy "$pg_port"; then
  new=$(free_port_from "$((pg_port + 1))")
  echo "Postgres 포트 $pg_port 는 다른 프로그램이 쓰고 있어서 $new 를 씁니다(.env에 기록)."
  pg_port=$new
fi
if our_service_running redis; then
  echo "Redis는 이미 이 프로젝트의 컨테이너가 실행 중입니다(포트 $redis_port)."
elif port_busy "$redis_port"; then
  new=$(free_port_from "$((redis_port + 1))")
  echo "Redis 포트 $redis_port 는 다른 프로그램이 쓰고 있어서 $new 를 씁니다(.env에 기록)."
  redis_port=$new
fi
env_set POSTGRES_PORT "$pg_port"
env_set REDIS_PORT "$redis_port"
env_set DATABASE_URL "postgresql://swyp:swyp@localhost:$pg_port/swyp"
env_set DIRECT_URL "postgresql://swyp:swyp@localhost:$pg_port/swyp"
env_set REDIS_URL "redis://localhost:$redis_port"
echo "Postgres $pg_port, Redis $redis_port"

say "4/6 의존성 설치(npm ci)"
npm ci

say "5/6 로컬 Postgres·Redis 실행"
docker compose up -d --wait
local_db_url=$(env_get DIRECT_URL)

say "6/6 마이그레이션 적용과 확인"
# 운영이 아닌 로컬 DB에만 적용하도록 주소를 명령에 직접 넘긴다.
DIRECT_URL="$local_db_url" npm run db:deploy
npm test
npm run test:e2e

cat <<EOF

완료했습니다. 로컬 환경이 준비됐습니다.

  서버 실행:   npm run start:dev      (주소 http://localhost:$(env_get PORT))
  확인:        curl localhost:$(env_get PORT)/health
  끄기:        docker compose down      (데이터까지 지우기: docker compose down -v)

다음은 docs/onboarding.md의 '첫 PR까지'를 보세요.
EOF
