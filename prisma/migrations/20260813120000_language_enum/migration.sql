-- CreateEnum (idempotent — safe if a prior partial run already created the type)
DO $$ BEGIN
  CREATE TYPE "Language" AS ENUM ('EN', 'FR', 'RW', 'SW');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- AlterTable User.defaultLanguage (skip if already Language)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'User'
      AND column_name = 'defaultLanguage'
      AND udt_name = 'text'
  ) THEN
    ALTER TABLE "User" ALTER COLUMN "defaultLanguage" TYPE "Language" USING (
      CASE
        WHEN "defaultLanguage" IS NULL THEN NULL
        WHEN UPPER("defaultLanguage") IN ('EN', 'FR', 'RW', 'SW') THEN UPPER("defaultLanguage")::"Language"
        ELSE 'EN'::"Language"
      END
    );
  END IF;
END $$;

-- AlterTable GuideProfile.languages (skip if still text[])
-- Postgres forbids subqueries in ALTER COLUMN ... USING, so convert via temp column.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'GuideProfile'
      AND column_name = 'languages'
      AND udt_name = '_text'
  ) THEN
    ALTER TABLE "GuideProfile" ADD COLUMN "languages_tmp" "Language"[] NOT NULL DEFAULT ARRAY[]::"Language"[];

    UPDATE "GuideProfile" SET "languages_tmp" = COALESCE(
      ARRAY(
        SELECT CASE
          WHEN UPPER(lang) IN ('EN', 'FR', 'RW', 'SW') THEN UPPER(lang)::"Language"
          ELSE 'EN'::"Language"
        END
        FROM unnest("languages") AS lang
      ),
      ARRAY[]::"Language"[]
    );

    ALTER TABLE "GuideProfile" DROP COLUMN "languages";
    ALTER TABLE "GuideProfile" RENAME COLUMN "languages_tmp" TO "languages";
    ALTER TABLE "GuideProfile" ALTER COLUMN "languages" DROP DEFAULT;
  END IF;
END $$;
