// 로컬 개발용 .env를 읽는다. 파일이 없으면(배포 환경) 아무것도 하지 않는다.
export function loadEnv(): void {
  try {
    process.loadEnvFile();
  } catch {}
}
