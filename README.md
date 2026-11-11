# backend

NestJS(TypeScript) 백엔드 서버입니다.

## 로컬 실행

```bash
npm install
npm run start:dev   # http://localhost:3000
```

- 포트는 환경 변수 `PORT`로 바꿀 수 있습니다. 기본값은 3000입니다.
- 확인: `curl http://localhost:3000` → `Hello World!`

## 자주 쓰는 명령

| 명령 | 하는 일 |
|---|---|
| `npm run build` | 빌드 (`dist/`) |
| `npm test` | 단위 테스트 |
| `npm run test:e2e` | e2e 테스트 |
| `npm run lint` | 린트 |

## Docker

```bash
docker build -t backend .
docker run --rm -p 3000:3000 backend
```

브랜치·커밋·PR 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다.
