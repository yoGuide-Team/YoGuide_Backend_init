# yoGuide Backend

NestJS + Prisma + PostgreSQL API serving the Trippoto mobile app and yoGuide web app.
Auth is JWT (bcrypt passwords) with email-OTP verification and Google Sign-In.

## Quick start (fresh clone)

```bash
cp .env.example .env          # then fill values — see below
npm install
npm approve-scripts bcrypt prisma @prisma/client protobufjs   # allow native build scripts
npx prisma migrate deploy     # apply ALL migrations
npm run prisma:seed           # demo data (idempotent, safe to re-run)
npm run start:dev             # http://localhost:3030, Swagger at /docs
```

Minimum `.env` for local dev:

```
PORT=3030
DATABASE_URL="postgresql://<you>@localhost:5432/yoguide?schema=public"
DIRECT_URL="postgresql://<you>@localhost:5432/yoguide?schema=public"
JWT_SECRET="any-long-random-string-for-dev"
```

No Docker needed if you have local Postgres. Email (Resend/Gmail) vars are
only needed if you want real OTP emails — see "Email verification" below.

## If you already had the repo before 2026-08-14

1. `git pull`, `npm install`, then `npx prisma migrate deploy`.
2. If Prisma complains that `20260813120000_language_enum` was **modified after
   it was applied**: the file was fixed (the original SQL could never run on
   Postgres — subquery in `ALTER COLUMN ... USING`). Refresh the stored
   checksum, don't reset your DB:

   ```bash
   SUM=$(shasum -a 256 prisma/migrations/20260813120000_language_enum/migration.sql | cut -d' ' -f1)
   psql <your-db> -c "UPDATE \"_prisma_migrations\" SET checksum = '$SUM' WHERE migration_name = '20260813120000_language_enum';"
   ```

   If the migration is recorded as **failed** (started, never finished), first:
   `npx prisma migrate resolve --rolled-back 20260813120000_language_enum`.
3. `npm run prisma:seed` to get the new demo catalog.

## What the seed gives you (`npm run prisma:seed`)

Idempotent — upserts by fixed ids, safe to run repeatedly.

**Logins**

| Account | Email | Password |
|---|---|---|
| Admin | admin@yoguide.app | Y0guide#Admin2026 |
| Tourist | tourist@yoguide.app | Y0guide#Tour2026 |
| Guide (Eric Mugisha) | guide@yoguide.app | Y0guide#Guide2026 |
| Chefs (Divine, Olivier) | chef.divine@ / chef.olivier@yoguide.app | Y0guide#Chef2026 |

All seeded accounts are pre-verified (no OTP needed to log in).

**Catalog**: 4 regions (Kigali, Musanze, Rubavu, Nyungwe) · 9 packages
(city, adventure, culture, community, nature, 2 chef experiences) ·
~26 individual tours · 5 vehicles matching the app's vehicle types ·
3 tour guides + 2 chefs, all with star reviews.

**Images are real**: package/tour photos are Wikimedia Commons images that
were each visually verified to match their subject. To use our own
photography later, edit the `REAL_IMAGES` map at the top of
`prisma/seed.ts` — one URL per line.

**Chefs / gastronomy**: chef data (menu, story, per-guest rate) lives in
`GuideProfile.gastronomy` (JSON). Each chef has an experience Package whose
**title equals** the chef's `experienceName` — the app books chef sessions
by matching the two, so keep them in sync.

## API map

Swagger has everything: `http://localhost:3030/docs`. High level:

- **Auth** (teammate-owned): `/auth/register|login|me|verify-otp|...`
- **Public catalog**: `GET /catalog/regions|tour-types|packages|tours|vehicles|guides[/:id]|languages|visitor-types`
- **App-compat** (flat shapes the Flutter app already parses):
  `GET /tours?category=CITY|ADVENTURE|COMMUNITY|GASTRONOMY|...`, `GET /guides`
- **Tourist** (JWT; rows always tied to the token's user):
  `POST /packages/custom` (compose a package from tour ids — price/duration
  computed server-side) · `GET /me/packages` · `POST /bookings` (totalDue
  computed server-side, starts PENDING) · `GET /me/bookings` ·
  `POST /bookings/:id/cancel` · `/me/trips` (teammate-owned)
- **Guide self-service** (JWT + GUIDE role): `/guide/profile` ·
  `/guide/vehicles` · `/guide/bookings` + `/:id/confirm|decline|complete`
- **Admin** (JWT + ADMIN role): full CRUD under `/admin/*`
- **Wallet/payments**: `/wallet`, `/admin/payments`, ...

Booking status machine: `PENDING → CONFIRMED → COMPLETED`, guide may
`DECLINE`, tourist may `CANCEL` while PENDING/CONFIRMED.

## Tests

```bash
npm run start:dev     # terminal 1 (server against a seeded DB)
npm run test:api      # terminal 2 — 73 end-to-end checks on every endpoint
```

The test creates throwaway users per run; safe on a dev database.

## Email verification in dev

`POST /auth/register` requires OTP verification, and without
`RESEND_API_KEY`/Gmail vars no email is sent. For local accounts either use
the pre-verified seed logins, or flip your user manually:

```sql
UPDATE "User" SET "emailVerified" = true WHERE email = 'you@example.com';
```

## Flutter app against this backend

In `Tripoguide_app/.env` set (no `/api` prefix on this branch —
the deployed main branch has `setGlobalPrefix('api')`, this one does not):

```
API_BASE_URL=http://10.0.2.2:3030    # Android emulator
API_BASE_URL=http://localhost:3030   # iOS simulator / desktop
```

Android debug builds already allow cleartext HTTP to the dev backend.
Gradle needs JDK ≤ 21 (`flutter config --jdk-dir <path-to-jdk-21>`).
