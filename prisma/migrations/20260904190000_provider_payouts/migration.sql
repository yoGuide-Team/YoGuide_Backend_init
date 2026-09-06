-- CreateEnum
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESSFUL', 'FAILED', 'CANCELLED');

-- AlterTable
ALTER TABLE "GuideProfile" ADD COLUMN     "paymentCode" TEXT,
ADD COLUMN     "payoutMsisdn" TEXT,
ADD COLUMN     "payoutName" TEXT,
ADD COLUMN     "payoutTelecomId" TEXT,
ADD COLUMN     "payoutVerified" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Payout" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "bookingId" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'RWF',
    "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
    "destinationMsisdn" TEXT NOT NULL,
    "destinationName" TEXT,
    "reference" TEXT NOT NULL,
    "providerRef" TEXT,
    "providerStatus" TEXT,
    "failureReason" TEXT,
    "requestedById" TEXT,
    "note" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Payout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Payout_reference_key" ON "Payout"("reference");

-- CreateIndex
CREATE INDEX "Payout_guideId_idx" ON "Payout"("guideId");

-- CreateIndex
CREATE INDEX "Payout_status_idx" ON "Payout"("status");

-- CreateIndex
CREATE INDEX "Payout_bookingId_idx" ON "Payout"("bookingId");

-- CreateIndex
CREATE INDEX "Payout_requestedById_idx" ON "Payout"("requestedById");

-- CreateIndex
CREATE UNIQUE INDEX "GuideProfile_paymentCode_key" ON "GuideProfile"("paymentCode");


-- ============================================================
-- Data backfill
-- ============================================================

-- Give every existing provider a payment code so their QR works as soon as
-- they set a payout number. Derived from the row's own uuid rather than
-- randomly, so this migration is deterministic and re-runnable.
UPDATE "GuideProfile"
SET "paymentCode" = 'YG' || UPPER(SUBSTRING(REPLACE("id"::text, '-', '') FROM 1 FOR 6))
WHERE "paymentCode" IS NULL;

-- payoutVerified stays false for everyone. Nobody is paid until an admin has
-- confirmed the destination out of band — including the maker whose number
-- was previously hardcoded in the payout worker.
