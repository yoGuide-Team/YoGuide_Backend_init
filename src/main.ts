import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as express from 'express';
import helmet from 'helmet';
import { mkdirSync } from 'fs';
import { AppModule } from './app.module';
import { UPLOADS_ROOT } from './files/files.service';
import { GlobalHttpExceptionFilter } from './common/http-exception.filter';
import { UserProfileResponse, RegisterPendingResponse } from './auth/dto';
import { TripResponse } from './me/trips.dto';
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
  // bodyParser disabled globally so /files/upload/:token can register a raw
  // (non-JSON) body parser ahead of the general json/urlencoded ones below —
  // Express middleware order matters, and the default Nest body parser has
  // no path restriction, so it would otherwise consume every request first.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  mkdirSync(UPLOADS_ROOT, { recursive: true });
  app.use('/files/upload', express.raw({ limit: '16mb', type: () => true }));
  app.use(express.json({ limit: '5mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.useStaticAssets(UPLOADS_ROOT, { prefix: '/uploads/' });

  // Security headers. `crossOriginResourcePolicy` is relaxed because
  // /uploads/ serves images consumed by the mobile apps and the web client
  // from different origins.
  app.use(
    helmet({
      contentSecurityPolicy: false, // Swagger UI at /docs needs inline assets
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS: an explicit allowlist, not a reflector.
  //
  // This previously used `origin: true`, which reflects *any* requesting
  // origin while also sending `credentials: true` — that combination lets
  // any website on the internet make credentialed calls to this API. The
  // allowlist comes from CORS_ALLOWED_ORIGINS (comma-separated); native
  // mobile clients send no Origin header and are unaffected either way.
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const frontendUrl = process.env.FRONTEND_URL?.trim();
  const allowedOrigins = [...new Set([...configuredOrigins, ...(frontendUrl ? [frontendUrl] : [])])];
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && allowedOrigins.length === 0) {
    logger.warn(
      'CORS_ALLOWED_ORIGINS is not set in production — browser clients will be blocked. ' +
        'Set it to your web app origin(s).',
    );
  }

  app.enableCors({
    origin: (origin, callback) => {
      // No Origin header: native apps, curl, server-to-server. Not a
      // browser cross-origin request, so CORS does not apply.
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      if (!isProduction && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin '${origin}' is not allowed by CORS.`), false);
    },
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  app.getHttpAdapter().get('/', (req: express.Request, res: express.Response) => {
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
      TripResponse,
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
