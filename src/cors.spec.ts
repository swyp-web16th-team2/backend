import { corsOrigins } from './cors.js';

describe('corsOrigins', () => {
  it('환경 변수가 없으면 로컬 개발 주소만 허용한다', () => {
    expect(corsOrigins(undefined)).toEqual([
      'http://localhost:3000',
      'http://localhost:5173',
    ]);
  });

  it('쉼표로 구분하고 공백과 빈 값은 버린다', () => {
    expect(corsOrigins(' https://a.example , ,https://b.example ')).toEqual([
      'https://a.example',
      'https://b.example',
    ]);
  });

  it('빈 문자열이면 어떤 주소도 허용하지 않는다', () => {
    expect(corsOrigins('')).toEqual([]);
  });
});
