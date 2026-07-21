-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "guideId" TEXT,
ADD COLUMN     "quantity" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "tourId" TEXT;
