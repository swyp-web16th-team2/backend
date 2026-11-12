FROM node:22-alpine AS build
WORKDIR /app
# npm ci의 postinstall이 Prisma 클라이언트를 만들기 때문에 스키마와 설정을 먼저 복사한다.
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN npm ci
COPY nest-cli.json tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
# 실행에는 Prisma CLI가 필요 없다(클라이언트는 빌드 결과 dist에 들어 있다). 운영 이미지에는 개발 도구가 필요 없다. 그런데 prisma CLI는 개발 의존성이면서 @prisma/client의 선택적 peer라서
# `npm ci --omit=dev`만으로는 빠지지 않고 이미지가 400MB 가까이 커진다. 개발 의존성 항목을 지우고 peer도 빼서 설치한다.
RUN npm pkg delete devDependencies \
    && npm install --omit=dev --omit=peer --ignore-scripts --no-audit --no-fund \
    && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/main"]
