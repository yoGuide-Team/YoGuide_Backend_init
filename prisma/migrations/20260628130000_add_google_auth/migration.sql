-- Add Google OAuth support to the User table.
--
-- passwordHash gets a default of '' so Google-only accounts (which have no
-- bcrypt hash) satisfy the NOT NULL constraint without any data migration.
-- Existing rows are unaffected (they already have a real hash).

ALTER TABLE "User" ADD COLUMN "googleId" TEXT;
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ALTER COLUMN "passwordHash" SET DEFAULT '';

CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");
