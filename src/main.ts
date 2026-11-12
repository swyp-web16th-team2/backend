import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupCors } from './cors.js';
import { loadEnv } from './env.js';

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupCors(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
