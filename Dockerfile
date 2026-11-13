FROM node:22-alpine AS build
# 이 이미지에는 pnpm이 없어서 corepack(Node에 들어 있음)으로 켠다. 버전은 package.json의 packageManager가 정한다.
RUN corepack enable
WORKDIR /app
# 설치(pnpm install)의 postinstall이 Prisma 클라이언트를 만들기 때문에 스키마와 설정을 먼저 복사한다.
COPY package.json pnpm-lock.yaml .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm run build

FROM node:22-alpine
ENV NODE_ENV=production
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-lock.yaml .npmrc ./
# 운영 이미지에는 개발 도구가 필요 없다. 클라이언트는 빌드 결과 dist에 들어 있어서 postinstall(prisma generate)도 돌리지 않는다.
# 그런데 prisma CLI는 개발 의존성이면서 @prisma/client의 선택적 peer라서, `pnpm install --prod`만으로는 빠지지 않고 이미지가 300MB쯤 커진다.
# 그래서 개발 의존성 항목을 지우고 설치한다(이 때문에 --frozen-lockfile을 쓰지 않는다. 남은 의존성의 버전은 lockfile을 우선해서 정해진다).
# 설치가 남기는 pnpm 저장소와 corepack이 받은 pnpm 실행 파일도 실행에 필요 없어서 같은 단계에서 지운다.
RUN node -e 'const fs = require("fs"); const p = JSON.parse(fs.readFileSync("package.json", "utf8")); delete p.devDependencies; fs.writeFileSync("package.json", JSON.stringify(p, null, 2));' \
    && pnpm install --prod --no-frozen-lockfile --ignore-scripts --store-dir /tmp/pnpm-store \
    && rm -rf /tmp/pnpm-store /root/.cache /root/.local
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
