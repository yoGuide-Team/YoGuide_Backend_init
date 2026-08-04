import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import {
  ApiErrorResponse,
  AuthSessionResponse,
  AuthUserResponse,
  BookingResponse,
  BookingTransactionResponse,
  HealthResponse,
  OkResponse,
  PlaceResponse,
  WalletResponse,
  WalletTransactionResponse,
} from './common/responses';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.setGlobalPrefix('api');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // ── Swagger / OpenAPI ──────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('yoGuide Platform API')
    .setDescription('yoGuide Platform API')
    .setVersion('0.6.0')
    .addServer('http://localhost:3030', 'Local development')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      'access-token',
    )
    .build();
  const swaggerDoc = SwaggerModule.createDocument(app, swaggerConfig, {
    extraModels: [
      ApiErrorResponse,
      AuthSessionResponse,
      AuthUserResponse,
      HealthResponse,
      OkResponse,
      WalletResponse,
      WalletTransactionResponse,
      BookingResponse,
      BookingTransactionResponse,
      PlaceResponse,
    ],
  });
  SwaggerModule.setup('docs', app, swaggerDoc, {
    customSiteTitle: 'yoGuide API · v0.6.0',
  });

  const port = Number(process.env.PORT ?? 3030);
  await app.listen(port, '0.0.0.0');
  Logger.log(`yoGuide backend listening on http://0.0.0.0:${port}`, 'Bootstrap');
  Logger.log(`API docs: http://0.0.0.0:${port}/docs`, 'Bootstrap');
}

bootstrap();
