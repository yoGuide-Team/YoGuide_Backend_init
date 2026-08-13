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
ALTER TABLE "GuideProfile" ALTER COLUMN "languages" TYPE "Language"[] USING (
  COALESCE(
    ARRAY(
      SELECT CASE UPPER(lang)
        WHEN 'EN' THEN 'EN'::"Language"
        WHEN 'FR' THEN 'FR'::"Language"
        WHEN 'RW' THEN 'RW'::"Language"
        WHEN 'SW' THEN 'SW'::"Language"
        ELSE 'EN'::"Language"
      END
      FROM unnest("languages") AS lang
    ),
    ARRAY[]::"Language"[]
  )
);
