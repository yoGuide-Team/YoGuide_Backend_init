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
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ["*", 'http://localhost:5000'],
    credentials:true,
  });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new GlobalHttpExceptionFilter());

  // ── Swagger / OpenAPI ──────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('yoGuide Platform API')
    .setDescription(
      [
        '## yoGuide Platform API',
        '',
        'Self-hosted backend powering the **yoGuide / Trippoto** travel platform — a country-scale tourism OS designed to expand from Rwanda outward, one city at a time.',
        '',
        '> Built for the Volcanoes corridor, with live places, vendors, guides, and bookings you can show travelers before they arrive — and an operator surface designed for hotel managers, tour operators, and government partners that walks in next.',
        '',
        '---',
        '',
        '### What ships in this version',
        '',
        '- **3 client apps** consuming the same backend: tourist mobile app (Trippoto), web app (yoGuide), and the operator/admin dashboard.',
        '- **Postgres** schema covering: users, roles, places, cities, tours, guides, vendors, products, orders, bookings, wallets, transactions, reviews, favorites, itineraries, notifications, messages, events, phrases, audit log, analytics events.',
        '- **Liquid RBAC** — roles live in a DB table; permissions are arrays on rows; changes take effect instantly on the next call without forcing a token refresh.',
        '- **Atomic money flows** — every wallet move is wrapped in a Postgres transaction. Booking creation, cancellation, and refund all settle or roll back together.',
        '- **Operator console** at the web admin URL — KPIs, charts, full CRUD for catalogue + people + roles, force-refunds, manual ledger adjustments.',
        '',
        '### Architecture (10-second tour)',
        '',
        '```',
        'Flutter apps  ──┐',
        '                ├──→  REST/JSON  ──→  NestJS  ──→  Prisma  ──→  Postgres 18',
        'Operator web ───┘                       │',
        '                                        ├─ JWT auth (HS256)',
        '                                        ├─ DB-driven RBAC',
        '                                        ├─ class-validator pipes',
        '                                        └─ global error envelope',
        '```',
        '',
        '### Authentication',
        '',
        '`POST /auth/register` and `POST /auth/login` return `{ token, user }`. Send `Authorization: Bearer <token>` on every authenticated request.',
        '',
        'JWT lifetime defaults to **30 days**. The token *is not* the source of truth for permissions — every authenticated request re-fetches the user + role from the DB so changes take effect immediately. Revoke a user instantly by changing their role.',
        '',
        '### Roles & permissions',
        '',
        'System roles ship with the seed; custom roles can be added through `/admin/roles`. Each role carries an array of permission strings. `*` is the superuser shortcut.',
        '',
        '| Role             | System | Notable permissions                                          |',
        '| ---------------- | :----: | ------------------------------------------------------------ |',
        '| `user`           |   ✓    | (none — tourist default)                                     |',
        '| `admin`          |   ✓    | `*`                                                          |',
        '| `tour`           |   ✓    | `admin.panel.access`, `places.read.admin`                    |',
        '| `institute`      |   ✓    | `admin.panel.access`, `places.read.admin`                    |',
        '| `hotel_manager`  |        | `admin.panel.access`, `places.read.admin`, `places.write`, `bookings.read` |',
        '',
        'Common permission strings: `users.read`, `users.write`, `roles.read`, `roles.write`, `places.read.admin`, `places.write`, `cities.write`, `tours.read.admin`, `tours.write`, `guides.read`, `guides.write`, `vendors.read`, `vendors.write`, `products.read.admin`, `products.write`, `orders.read`, `orders.write`, `events.read`, `events.write`, `bookings.read`, `bookings.write`, `wallets.read`, `wallets.write`, `reviews.moderate`, `notifications.send`, `analytics.read`, `audit.read`, `admin.panel.access`.',
        '',
        '### Booking lifecycle',
        '',
        '```',
        '┌─ pending ──┬─→ confirmed ──→ completed',
        '│            │',
        '│            └─→ cancelled (no settled charge)',
        '│',
        '└─→ refunded (settled charge → refund settled)',
        '```',
        '',
        '`POST /bookings` with `paymentMethod=wallet` debits atomically; insufficient balance → `400`. With `paymentMethod=cash|card|momo` the booking starts `pending` and the operator settles the charge externally (`PATCH /admin/bookings/:bookingId/transactions/:txId`). Cancelling a wallet-funded booking auto-credits the wallet back.',
        '',
        '### Money model',
        '',
        'Every monetary amount is **integer cents** in the booking currency. No floats anywhere — bug surface for rounding errors is intentionally zero. Wallets are single-currency (defaults to USD); cross-currency conversion lands when a real FX feed is wired.',
        '',
        '### Error envelope',
        '',
        'Every error response, from validation failures to permission rejections to crashes, is shaped like:',
        '',
        '```json',
        '{',
        '  "statusCode": 403,',
        '  "error": "Forbidden",',
        '  "message": "Requires permission: users.read",',
        '  "timestamp": "2026-05-09T11:42:18.041Z",',
        '  "path": "/admin/users"',
        '}',
        '```',
        '',
        'Validation failures emit `message` as an array of strings (one per field). See the `ApiErrorResponse` schema below.',
        '',
        '### Versioning policy',
        '',
        'Pre-1.0 — minor versions can break compatibility. After 1.0, breaking changes will only ship in major versions and the OpenAPI spec at `/docs-json` is the source of truth.',
        '',
        '### Quick start',
        '',
        '1. Click **Authorize** above and paste a token (default admin: `admin@yoguide.app` / `Y0guide#Admin2026`).',
        '2. Call `GET /me` to confirm your role + permissions.',
        '3. Browse `Public · *` for the read-only surface; `Admin · *` for operator endpoints.',
        '4. Try `POST /admin/places` from the Swagger UI — it works against the live local server.',
      ].join('\n'),
    )
    .setVersion('0.6.0')
    .setContact(
      'yoGuide Engineering',
      'https://yoguide.app',
      'engineering@yoguide.app',
    )
    .addServer('http://localhost:3030', 'Local development')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          "Paste the `token` returned by `/auth/login` or `/auth/register`. The session is invalidated when the user is deleted or their role's permissions change in a way that breaks access.",
      },
      'access-token',
    )
    .addTag('Public', 'Open endpoints — no authentication required.')
    .addTag('Public · Cities', 'Cities + regions the platform covers.')
    .addTag('Public · Tours', 'Bookable tour packages with stops.')
    .addTag('Public · Guides', 'Verified guide marketplace — search, filter, view.')
    .addTag('Public · Vendors', 'Hotels, shops, operators, transport.')
    .addTag('Public · Products', 'Souvenir + experience marketplace.')
    .addTag('Public · Events', "Festivals, concerts, what's on.")
    .addTag('Public · Translator', 'Kinyarwanda / English / French phrase pack.')
    .addTag('Account', 'Sign-up, sign-in, and "who am I".')
    .addTag('Wallet', 'Per-user balance and transaction history.')
    .addTag('Bookings', "User-facing booking lifecycle.")
    .addTag('Reviews', 'User reviews on places, guides, and tours.')
    .addTag('Favorites', 'Saved places, guides, tours.')
    .addTag('Itineraries', 'User-built trip plans.')
    .addTag('Notifications', 'In-app notifications inbox.')
    .addTag('Messages', 'Direct messages — guide ↔ tourist.')
    .addTag('Orders', 'Cart checkout + order history.')
    .addTag('Files', 'Image / document upload signing.')
    .addTag('Analytics', 'Client-side event ingest.')
    .addTag('Admin · Users', 'List, edit, delete user accounts.')
    .addTag('Admin · Roles', 'Liquid role definitions — system + custom.')
    .addTag('Admin · Places', 'Discovery catalogue (the map and detail sheets).')
    .addTag('Admin · Cities', 'Add and edit covered cities.')
    .addTag('Admin · Tours', 'Operator-side tour CRUD + stops.')
    .addTag('Admin · Guides', 'Onboard, verify, manage documents.')
    .addTag('Admin · Reviews', 'Moderation queue.')
    .addTag('Admin · Vendors', 'Vendor onboarding + verification.')
    .addTag('Admin · Products', 'Marketplace catalogue management.')
    .addTag('Admin · Orders', 'Operator-side order fulfilment.')
    .addTag('Admin · Events', "Manage what's-on listings.")
    .addTag('Admin · Notifications', 'Broadcast and direct messaging.')
    .addTag('Admin · Bookings', 'Operator-side booking review + force-refund.')
    .addTag('Admin · Wallets', 'Operator ledger view + manual adjustments.')
    .addTag('Admin · Stats', 'Platform metrics for the dashboard overview.')
    .addTag('Admin · Analytics', 'Recent events + top events report.')
    .addTag('Admin · Audit log', 'Append-only ledger of admin / system actions.')
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
    customCss: `
      .topbar { display: none; }
      .swagger-ui .info .title { color: #0F5A46; }
      .swagger-ui .info .title small { background: #0F5A46; }
      .swagger-ui .opblock-tag { color: #10382C; font-weight: 700; }
      .swagger-ui .opblock-summary-method { background: #0F5A46; }
      .swagger-ui .opblock.opblock-post .opblock-summary-method { background: #0F5A46; }
      .swagger-ui .opblock.opblock-get .opblock-summary-method { background: #2563EB; }
      .swagger-ui .opblock.opblock-patch .opblock-summary-method { background: #D97706; }
      .swagger-ui .opblock.opblock-delete .opblock-summary-method { background: #B91C1C; }
    `,
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'none',
      tagsSorter: 'alpha',
      tryItOutEnabled: true,
      filter: true,
      defaultModelsExpandDepth: 1,
      defaultModelExpandDepth: 2,
    },
  });

  const port = Number(process.env.PORT ?? 3000);
  await app.listen(port);
  Logger.log(`yoGuide backend listening on http://localhost:${port}`, 'Bootstrap');
  Logger.log(`API docs: http://localhost:${port}/docs`, 'Bootstrap');
}

bootstrap();
