-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "PaymentStatus" ADD VALUE 'CANCELLED';
ALTER TYPE "PaymentStatus" ADD VALUE 'EXPIRED';
ALTER TYPE "PaymentStatus" ADD VALUE 'REFUNDED';
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_REFUNDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "BookingStatus" ADD VALUE 'PROCESSING';
ALTER TYPE "BookingStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "activationExpiresAt" TIMESTAMP(3),
ADD COLUMN     "activationTokenHash" TEXT,
ADD COLUMN     "mustSetPassword" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN     "bio" TEXT,
ADD COLUMN     "city" TEXT,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "dailyCapacity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "isVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifiedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "TourType" ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Package" ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "maxGuests" INTEGER,
ADD COLUMN     "ownerId" TEXT;

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "cancellationReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "guests" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "holdExpiresAt" TIMESTAMP(3),
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "startTime" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'USD',
ADD COLUMN     "failureReason" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "providerRef" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "refundedAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verifiedAt" TIMESTAMP(3),
ALTER COLUMN "status" SET DEFAULT 'PENDING';

-- CreateTable
CREATE TABLE "ProviderAvailability" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderAvailability_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilityException" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "isBlocked" BOOLEAN NOT NULL DEFAULT true,
    "capacity" INTEGER,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GuideApplication" (
    "id" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "nationality" TEXT,
    "guideType" "GuideType" NOT NULL DEFAULT 'INDIVIDUAL',
    "companyName" TEXT,
    "city" TEXT,
    "bio" TEXT,
    "languages" "Language"[] DEFAULT ARRAY[]::"Language"[],
    "documentUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "wantsGastronomy" BOOLEAN NOT NULL DEFAULT false,
    "status" "ApplicationStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdUserId" TEXT,
    "guideId" TEXT,
    "approvalEmailSentAt" TIMESTAMP(3),
    "approvalEmailStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GuideApplication_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentAttempt" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "providerRef" TEXT,
    "resultStatus" TEXT,
    "httpStatus" INTEGER,
    "responseBody" TEXT,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "paymentId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "RefundStatus" NOT NULL DEFAULT 'PENDING',
    "policyRule" TEXT,
    "reason" TEXT,
    "requestedById" TEXT,
    "providerRef" TEXT,
    "providerStatus" TEXT,
    "processedAt" TIMESTAMP(3),
    "failureReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderAvailability_guideId_idx" ON "ProviderAvailability"("guideId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderAvailability_guideId_weekday_key" ON "ProviderAvailability"("guideId", "weekday");

-- CreateIndex
CREATE INDEX "AvailabilityException_guideId_idx" ON "AvailabilityException"("guideId");

-- CreateIndex
CREATE INDEX "AvailabilityException_date_idx" ON "AvailabilityException"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilityException_guideId_date_key" ON "AvailabilityException"("guideId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "GuideApplication_guideId_key" ON "GuideApplication"("guideId");

-- CreateIndex
CREATE INDEX "GuideApplication_status_idx" ON "GuideApplication"("status");

-- CreateIndex
CREATE INDEX "GuideApplication_reviewedById_idx" ON "GuideApplication"("reviewedById");

-- CreateIndex
CREATE INDEX "GuideApplication_createdUserId_idx" ON "GuideApplication"("createdUserId");

-- CreateIndex
CREATE UNIQUE INDEX "GuideApplication_email_status_key" ON "GuideApplication"("email", "status");

-- CreateIndex
CREATE INDEX "PaymentAttempt_paymentId_idx" ON "PaymentAttempt"("paymentId");

-- CreateIndex
CREATE INDEX "PaymentAttempt_createdAt_idx" ON "PaymentAttempt"("createdAt");

-- CreateIndex
CREATE INDEX "Refund_bookingId_idx" ON "Refund"("bookingId");

-- CreateIndex
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");

-- CreateIndex
CREATE INDEX "Refund_status_idx" ON "Refund"("status");

-- CreateIndex
CREATE INDEX "Refund_requestedById_idx" ON "Refund"("requestedById");

-- CreateIndex
CREATE INDEX "GuideProfile_isVerified_idx" ON "GuideProfile"("isVerified");

-- CreateIndex
CREATE INDEX "TourType_ownerId_idx" ON "TourType"("ownerId");

-- CreateIndex
CREATE INDEX "Package_ownerId_idx" ON "Package"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "Booking_reference_key" ON "Booking"("reference");

-- CreateIndex
CREATE INDEX "Booking_hotelId_idx" ON "Booking"("hotelId");

-- CreateIndex
CREATE INDEX "Booking_guideId_scheduleDate_status_idx" ON "Booking"("guideId", "scheduleDate", "status");

-- CreateIndex
CREATE INDEX "Booking_status_holdExpiresAt_idx" ON "Booking"("status", "holdExpiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_status_idx" ON "Payment"("status");

-- CreateIndex
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");


-- ============================================================
-- Data backfill
-- ============================================================

-- Package.ownerId / TourType.ownerId stay NULL for every pre-existing row.
-- NULL means "platform-owned, admin-managed", which is exactly what these
-- rows were before provider ownership existed: only admins could create or
-- edit them. Provider-created rows from now on carry a real owner.

-- Gastronomy bookings already recorded a diner count in partySize; mirror it
-- into the new guests column so capacity accounting is correct for history.
UPDATE "Booking"
SET "guests" = "partySize"
WHERE "partySize" IS NOT NULL AND "partySize" > 0;

-- Give existing bookings a human-readable reference. Generated from the uuid
-- rather than randomly so this migration is deterministic and re-runnable.
UPDATE "Booking"
SET "reference" = 'YG-' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 8))
WHERE "reference" IS NULL;

-- Existing payments predate provider verification. Any payment already
-- recorded as SUCCESSFUL was accepted under the old client-declared flow,
-- so it is stamped with its creation time and labelled 'legacy' rather than
-- being silently presented as provider-verified.
UPDATE "Payment"
SET "provider" = 'legacy', "verifiedAt" = "createdAt"
WHERE "status" = 'SUCCESSFUL' AND "verifiedAt" IS NULL;

-- Guides that already existed were displayed as verified by the old public
-- API (isVerified was hardcoded true in the mappers). Preserve what users
-- already saw rather than mass-unverifying live providers; admins can revoke
-- individually. Providers created from here on default to false and become
-- verified only through admin approval of an application.
UPDATE "GuideProfile" SET "isVerified" = true, "verifiedAt" = NOW();

-- Open a default weekly schedule for existing guides so they remain bookable.
-- Without this every pre-existing guide would become unbookable the moment
-- availability is enforced, because a weekday with no rule is closed.
-- Monday–Saturday, 08:00–18:00. Providers can change this from their dashboard.
INSERT INTO "ProviderAvailability" ("id", "guideId", "weekday", "startTime", "endTime", "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  g."id",
  d.weekday,
  '08:00',
  '18:00',
  true,
  NOW(),
  NOW()
FROM "GuideProfile" g
CROSS JOIN (SELECT generate_series(1, 6) AS weekday) d
ON CONFLICT DO NOTHING;
