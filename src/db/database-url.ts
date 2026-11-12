// 주소가 설정되지 않았을 때 pg가 PGHOST 같은 기본 환경 변수로 엉뚱한 DB에 붙지 않게 하려는 도우미.
// 서버는 DB 없이도 떠야 하므로, 없으면 절대 연결되지 않는 주소(.invalid)를 대신 넘긴다.
export const UNCONFIGURED_DATABASE_URL =
  'postgresql://unconfigured.invalid:1/unconfigured';

export function databaseUrl(): string | undefined {
  const url = process.env.DATABASE_URL?.trim();
  return url ? url : undefined;
}
