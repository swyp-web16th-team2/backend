# backend

NestJS(TypeScript) 백엔드 서버입니다.

## 로컬 실행

```bash
npm install
npm run start:dev   # http://localhost:3000
```

- 포트는 환경 변수 `PORT`로 바꿀 수 있습니다. 기본값은 3000입니다.
- 확인: `curl http://localhost:3000` → `Hello World!`

## CORS

브라우저(React 등)에서 이 API를 부를 수 있는 주소는 환경 변수 `CORS_ORIGINS`(쉼표로 구분)로 정합니다. 없으면 로컬 개발 주소(`http://localhost:3000`, `http://localhost:5173`)만 허용합니다. 배포 환경의 값은 `infra` 레포 `apps/backend/deployment.yaml`에서 바꿉니다.

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

## 이미지

`main`에 병합되면 GitHub Actions가 이미지를 `ghcr.io/swyp-web16th-team2/backend:<커밋 SHA>`로 올립니다. `latest` 태그는 쓰지 않습니다.

이어서 `infra` 레포의 이미지 태그를 같은 커밋 SHA로 자동으로 바꿔 커밋하고, Argo CD가 그것을 보고 홈서버 k3s에 배포합니다. (`infra`에 쓸 수 있는 배포 키가 Actions 시크릿 `INFRA_DEPLOY_KEY`에 있어야 합니다. 이 키로 CI가 `infra` 전체를 바꿀 수 있으므로 `main` 병합 때만 도는 `deploy` 작업에서만 씁니다.)

브랜치·커밋·PR 규칙은 [CONTRIBUTING.md](CONTRIBUTING.md)를 따릅니다.
