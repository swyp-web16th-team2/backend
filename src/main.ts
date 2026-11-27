import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { loadEnv } from './env.js';
import { setupApp } from './setup-app.js';

async function bootstrap() {
  loadEnv();
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupApp(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
