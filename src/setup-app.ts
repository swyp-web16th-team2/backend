import { type INestApplication, RequestMethod } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import { HttpExceptionFilter } from './common/filters/http-exception.filter.js';
import { setupCors } from './cors.js';

export interface SetupAppOptions {
  corsOriginsEnv?: string;
}

export function setupApp(
  app: INestApplication,
  options?: SetupAppOptions,
): void {
  app.use(cookieParser());
  setupCors(app, options?.corsOriginsEnv);
  app.setGlobalPrefix('api', {
    exclude: [
      { path: '/', method: RequestMethod.GET },
      { path: 'health', method: RequestMethod.GET },
    ],
  });
  app.useGlobalFilters(new HttpExceptionFilter());
}
