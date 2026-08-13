import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { UserProfileResponse, RegisterPendingResponse } from './auth/dto';
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

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  app.getHttpAdapter().get('/', (req, res) => {
    res.status(200).json({
      status: 'ok',
      service: 'yoGuide backend',
      docs: '/docs',
      health: '/health',
      timestamp: new Date().toISOString(),
    });
  });

  // ── Swagger / OpenAPI ──────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('yoGuide Platform API')
    .setDescription(
      [
        'Interactive API reference for the yoGuide backend.',
        '',
        '**Authentication:** Most endpoints require a JWT bearer token. Obtain one via `POST /auth/login` or `POST /auth/register`, then click **Authorize** and paste the token.',
        '',
        '**Admin endpoints** (`/admin/*`) require a user with role `ADMIN`.',
        '',
        '**Enums** (shown as dropdowns in request bodies where applicable):',
        '- `UserRole`: ADMIN, TOURIST, GUIDE',
        '- `VisitorType`: VISITOR, INVESTOR, LAYOVER, EXPERT',
        '- `GuideType`: INDIVIDUAL, COMPANY',
        '- `Language`: EN, FR, RW, SW',
        '- `MediaType`: IMAGE, VIDEO, PDF',
        '- `PaymentStatus`: PENDING, SUCCESSFUL, FAILED',
        '- `PaymentMethod`: CARD, MOMO',
        '- `WalletAdjustmentKind`: adjustment, topup, refund, debit',
        '- Top-up `method`: card, momo, cash',
      ].join('\n'),
    )
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
      UserProfileResponse,
      RegisterPendingResponse,
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

  const startOnPort = async (port: number) => {
    try {
      await app.listen(port,'0.0.0.0');
      Logger.log(`yoGuide backend listening on http://0.0.0.0:${port}`, 'Bootstrap');
      Logger.log(`API docs: http://0.0.0.0:${port}/docs`, 'Bootstrap');
    } catch (error: any) {
      if (error?.code === 'EADDRINUSE') {
        const nextPort = port + 1;
        logger.warn(`Port ${port} is busy, retrying on ${nextPort}.`);
        await startOnPort(nextPort);
        return;
      }
      throw error;
    }
  };

  const port = Number(process.env.PORT ?? 3030);
  await startOnPort(port);

}

bootstrap();
