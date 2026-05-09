# yoGuide Backend

API serving the Trippoto mobile app and yoGuide web app.

## Stack

- NestJS (TypeScript)
- Prisma → SQLite for now (dev-only stop-gap), Postgres for production
- Firebase Admin SDK for token verification (both apps already authenticate
  through Firebase Auth project `yoguide`)

## Quick start

```bash
cd backend
cp .env.example .env
npm install
npm run prisma:migrate -- --name init
npm run start:dev
```

The server will print:

```
yoGuide backend listening on http://localhost:3000
```

You can hit `GET /health` immediately — no auth needed.

```bash
curl http://localhost:3000/health
# { "status": "ok", "db": "ok", "uptimeSeconds": 3 }
```

## Authenticated endpoints (`/me`)

Requires a Firebase ID token. To enable token verification on this server:

1. In the Firebase Console for project `yoguide`, go to **Project settings →
   Service accounts** and click **Generate new private key**.
2. Save the downloaded JSON as `backend/firebase-service-account.json`. (It's
   gitignored.)
3. Restart `npm run start:dev`. The server log should say
   `Firebase Admin initialised for project yoguide`.

To get a real ID token, sign in with the Flutter app and read it from
`FirebaseAuth.instance.currentUser?.getIdToken()`. Then:

```bash
curl http://localhost:3000/me \
  -H "Authorization: Bearer <id-token>"
# { "id": "...", "firebaseUid": "...", "email": "...", "role": "user" }
```

The first request for any Firebase user creates a row in `User`. Subsequent
requests return the same row.

## Switching to Postgres

When you're ready (and have Docker installed):

```bash
docker compose up -d
```

Edit `backend/prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

In `.env`:

```
DATABASE_URL="postgresql://yoguide:yoguide@localhost:5432/yoguide?schema=public"
```

Then re-run migrations:

```bash
rm -rf prisma/migrations
npm run prisma:migrate -- --name init
```

(For production deploy, never `rm -rf migrations` — generate a new migration
on top.)

## Layout

```
backend/
├── prisma/
│   └── schema.prisma          # User table for now
├── src/
│   ├── main.ts
│   ├── app.module.ts
│   ├── prisma/                # PrismaService (global)
│   ├── auth/
│   │   ├── firebase.service.ts        # Firebase Admin init + verifyIdToken
│   │   ├── auth.guard.ts              # Bearer token → req.user, upserts User
│   │   ├── current-user.decorator.ts  # @CurrentUser() in controllers
│   │   └── authenticated-user.ts
│   ├── health/                # GET /health (open)
│   └── me/                    # GET /me (auth required)
└── docker-compose.yml         # Postgres for when Docker is available
```
