/*
  Warnings:

  - The `category` column on the `Tour` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "TourCategory" AS ENUM ('CITY', 'ADVENTURE', 'COMMUNITY', 'GASTRONOMY', 'CUSTOM');

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "maxGroupSize" INTEGER DEFAULT 10,
ADD COLUMN     "rating" DOUBLE PRECISION NOT NULL DEFAULT 5.0,
ADD COLUMN     "reviewCount" INTEGER NOT NULL DEFAULT 0,
DROP COLUMN "category",
ADD COLUMN     "category" "TourCategory" NOT NULL DEFAULT 'CITY';

-- CreateIndex
CREATE INDEX "Tour_category_idx" ON "Tour"("category");

-- CreateIndex
CREATE INDEX "Tour_cityId_idx" ON "Tour"("cityId");
