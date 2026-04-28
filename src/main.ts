import { Logger, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  const logger = new Logger('Bootstrap');
  const config = app.get(ConfigService);

  const rawOrigins = config.get<string>('CORS_ORIGINS', '*');
  const origin =
    rawOrigins.trim() === '*'
      ? true
      : rawOrigins.split(',').map((o) => o.trim()).filter(Boolean);
  app.enableCors({
    origin,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'x-api-key'],
    maxAge: 86400,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  app.useGlobalFilters(new HttpExceptionFilter());

  const port = config.get<number>('PORT', 4000);
  await app.listen(port);

  logger.log(`api-code-bundle-packaged ouvindo em http://localhost:${port}`);
}

bootstrap();
