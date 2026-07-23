-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "Review" ADD COLUMN     "vendorId" TEXT;

-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "address" TEXT,
ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "checkInTime" TEXT,
ADD COLUMN     "checkOutTime" TEXT,
ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "Review_vendorId_idx" ON "Review"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "Vendor_ownerId_key" ON "Vendor"("ownerId");
