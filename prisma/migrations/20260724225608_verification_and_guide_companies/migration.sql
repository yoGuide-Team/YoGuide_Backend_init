-- AlterTable
ALTER TABLE "Guide" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "companyId" TEXT,
ADD COLUMN     "guideId" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityDocUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "identityRejectionReason" TEXT,
ADD COLUMN     "identityStatus" TEXT NOT NULL DEFAULT 'none';

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable
CREATE TABLE "GuideCompany" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contact" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "city" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "plateNumber" TEXT,
    "seats" INTEGER,
    "photoUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GuideCompany_ownerId_key" ON "GuideCompany"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideCompany_slug_key" ON "GuideCompany"("slug");

-- CreateIndex
CREATE INDEX "Vehicle_companyId_idx" ON "Vehicle"("companyId");

-- CreateIndex
CREATE INDEX "Guide_companyId_idx" ON "Guide"("companyId");

-- CreateIndex
CREATE INDEX "Tour_guideId_idx" ON "Tour"("guideId");

-- CreateIndex
CREATE INDEX "Tour_companyId_idx" ON "Tour"("companyId");

-- Grandfather pre-existing accounts as identity-verified so nobody with
-- existing wallet history is retroactively locked out of yoEcoPay — only
-- accounts registering after this migration start at 'none'. Same
-- precedent already used once in this project for User.emailVerified.
UPDATE "User" SET "identityStatus" = 'approved';

-- Existing Guide/Vendor rows already carry an isVerified boolean from
-- before `status` existed — sync status to match so the new
-- reject/resubmit workflow doesn't regress currently-live listings back
-- to 'pending'.
UPDATE "Guide" SET "status" = 'approved' WHERE "isVerified" = true;
UPDATE "Vendor" SET "status" = 'approved' WHERE "isVerified" = true;
