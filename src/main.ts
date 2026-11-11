import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { setupCors } from './cors.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableShutdownHooks();
  setupCors(app);
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
