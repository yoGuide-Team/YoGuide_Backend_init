-- AlterTable
ALTER TABLE "Payout" ADD COLUMN     "collectedAt" TIMESTAMP(3),
ADD COLUMN     "collectionRef" TEXT,
ADD COLUMN     "collectionStatus" TEXT,
ADD COLUMN     "payerUserId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Payout_collectionRef_key" ON "Payout"("collectionRef");

-- CreateIndex
CREATE INDEX "Payout_payerUserId_idx" ON "Payout"("payerUserId");

