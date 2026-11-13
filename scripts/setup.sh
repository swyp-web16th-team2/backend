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
# 포트와 compose 설정도 셸 값이 .env보다 우선해서 연결 대상이 어긋나므로 지운다. 포트는 .env에서만 바꾼다.
unset POSTGRES_PORT REDIS_PORT COMPOSE_PROJECT_NAME COMPOSE_FILE COMPOSE_PROFILES COMPOSE_ENV_FILES

say "1/6 필요한 도구 확인"
for c in git node npm docker; do
  command -v "$c" >/dev/null 2>&1 || die "$c 가 설치되어 있지 않습니다. docs/onboarding.md의 '준비물'을 먼저 확인하세요."
done
# Node 범위는 package-lock.json의 engines 기준이다. Prisma는 ^22.12 || >=24(23은 제외)를 요구해서 못 맞으면 멈추고,
# Nest CLI 쪽 개발 도구는 ^22.22.3 || ^24.15 || >=26이라 못 맞으면 경고만 한다(설치는 되지만 지원 범위 밖).
node_level() { # 0=충분, 1=동작은 하지만 개발 도구 권장 범위 밖, 2=Prisma가 지원하지 않음
  node -e 'const [a, b, c] = process.argv[1].split(".").map(Number);
    const prisma = (a === 22 && b >= 12) || a >= 24;
    const tools = (a === 22 && (b > 22 || (b === 22 && c >= 3))) || (a === 24 && b >= 15) || a >= 26;
    process.exit(!prisma ? 2 : !tools ? 1 : 0);' "$1"
}
node_ver=$(node -p 'process.versions.node')
set +e; node_level "$node_ver"; level=$?; set -e
[ "$level" -ne 2 ] || die "Node $node_ver 는 Prisma가 지원하지 않습니다(22.12 이상의 22.x, 또는 24 이상. 23은 안 됩니다). nvm을 쓴다면 'nvm install 22 && nvm use 22' 후 다시 실행하세요."
[ "$level" -ne 1 ] || echo "[주의] Node $node_ver 는 개발 도구(Nest CLI 등)의 지원 범위(22.22.3 이상)보다 낮습니다. 지금은 계속 진행하지만, 이상한 오류가 나면 'nvm install 22'로 최신 22.x로 올리세요."
docker compose version >/dev/null 2>&1 || die "'docker compose' 명령이 없습니다. Docker Desktop을 최신으로 설치하거나 compose v2 플러그인을 설치하세요."
docker info >/dev/null 2>&1 || die "Docker가 실행 중이 아닙니다. Docker Desktop을 켠 뒤 다시 실행하세요."
echo "node $(node -v), npm $(npm -v), $(docker compose version --short 2>/dev/null || echo compose)"

say "2/6 .env 준비"
if [ -f .env ]; then
  echo ".env가 이미 있습니다. 새로 만들지 않고, 로컬 DB·Redis 주소와 포트 줄만 이 스크립트가 맞춰 씁니다."
else
  cp .env.example .env
  echo ".env.example을 복사해 .env를 만들었습니다."
fi

env_get() { grep -E "^$1=" .env | tail -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/[[:space:]]*$//' -e 's/^"\(.*\)"$/\1/' -e "s/^'\(.*\)'$/\1/" || true; }
env_set() { # 키가 있으면 값을 바꾸고 없으면 맨 아래에 추가한다. macOS·Linux sed 차이를 피하려고 임시 파일을 쓴다.
  local tmp; tmp=$(mktemp)
  if grep -qE "^$1=" .env; then sed "s|^$1=.*|$1=$2|" .env > "$tmp"; else { cat .env; [ -z "$(tail -c1 .env)" ] || echo; echo "$1=$2"; } > "$tmp"; fi
  cat "$tmp" > .env; rm -f "$tmp"
}
port_busy() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }
our_service_running() { [ -n "$(docker compose ps --status running -q "$1" 2>/dev/null)" ]; }
# 이 프로젝트의 컨테이너가 실행 중이고, 실제로 게시한 호스트 포트가 .env의 포트와 같을 때만 "이미 우리 것"으로 본다.
our_service_on_port() { our_service_running "$1" && [ "$(docker compose port "$1" "$2" 2>/dev/null | sed 's/.*://')" = "$3" ]; }
# 시작 포트부터 비어 있는 포트를 찾는다. 이미 쓰는 포트(port_busy)와, 두 번째·세 번째 인자로 준 포트(다른 서비스 몫)는 건너뛴다.
free_port_from() {
  local p=$1 skip1=${2:-} skip2=${3:-}
  while port_busy "$p" || [ "$p" = "$skip1" ] || [ "$p" = "$skip2" ]; do
    p=$((p + 1)); [ "$p" -lt $(($1 + 50)) ] || die "비어 있는 포트를 못 찾았습니다($1~$p)."
  done
  echo "$p"
}

# compose 프로젝트 이름이 같으면(폴더 이름이 같은 다른 체크아웃, 다른 프로젝트의 backend 폴더) 컨테이너와 볼륨을 서로 공유해서
# 한쪽의 'docker compose down -v'가 다른 쪽 데이터를 지운다. 그래서 체크아웃 경로마다 다른 이름을 .env에 한 번만 적어 둔다.
expected_name="swyp-backend-$(node -p 'require("crypto").createHash("sha1").update(process.argv[1]).digest("hex").slice(0, 8)' "$PWD")"
current_name=$(env_get COMPOSE_PROJECT_NAME)
if [ "$current_name" != "$expected_name" ]; then
  [ -z "$current_name" ] || echo "(.env의 compose 프로젝트 이름 $current_name 은 이 폴더 것이 아니라서 $expected_name 으로 바꿉니다. 다른 폴더에서 복사한 .env이거나 폴더를 옮긴 경우입니다.)"
  env_set COMPOSE_PROJECT_NAME "$expected_name"
fi
echo "compose 프로젝트 이름: $(env_get COMPOSE_PROJECT_NAME)"

# 이 스크립트는 로컬용이다. .env의 DB 주소를 실제로 파싱해서 접속 호스트가 localhost·127.0.0.1이 아니거나
# 쿼리로 호스트를 바꾸는 값(host, hostaddr)이 있으면 마이그레이션을 적용하지 않고 멈춘다.
is_local_url() {
  node -e 'try { const u = new URL(process.argv[1]); process.exit(["localhost", "127.0.0.1"].includes(u.hostname) && !u.searchParams.has("host") && !u.searchParams.has("hostaddr") ? 0 : 1); } catch { process.exit(1); }' "$1"
}
for k in DATABASE_URL DIRECT_URL; do
  is_local_url "$(env_get "$k")" || die ".env의 $k 가 로컬(localhost) 주소가 아닙니다. 운영 주소는 .env에 넣지 않습니다. .env를 지우고 다시 실행하거나 $k 를 로컬 주소로 고치세요."
done

say "3/6 포트 확인"
pg_port=$(env_get POSTGRES_PORT); pg_port=${pg_port:-5433}
redis_port=$(env_get REDIS_PORT); redis_port=${redis_port:-6380}
if our_service_on_port postgres 5432 "$pg_port"; then
  echo "Postgres는 이미 이 프로젝트의 컨테이너가 실행 중입니다(포트 $pg_port)."
elif port_busy "$pg_port"; then
  new=$(free_port_from "$((pg_port + 1))" "$redis_port")
  echo "Postgres 포트 $pg_port 는 다른 프로그램이 쓰고 있어서 $new 를 씁니다(.env에 기록)."
  pg_port=$new
fi
if our_service_on_port redis 6379 "$redis_port"; then
  echo "Redis는 이미 이 프로젝트의 컨테이너가 실행 중입니다(포트 $redis_port)."
elif port_busy "$redis_port"; then
  new=$(free_port_from "$((redis_port + 1))" "$pg_port")
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
