-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'FR', 'RW', 'SW');

-- AlterTable
ALTER TABLE "User" ALTER COLUMN "defaultLanguage" TYPE "Language" USING (
  CASE
    WHEN "defaultLanguage" IS NULL THEN NULL
    WHEN UPPER("defaultLanguage") IN ('EN', 'FR', 'RW', 'SW') THEN UPPER("defaultLanguage")::"Language"
    ELSE 'EN'::"Language"
  END
);

-- AlterTable
-- Postgres forbids subqueries in ALTER COLUMN ... USING, so convert the
-- text[] column via a temporary column + UPDATE instead.
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
