-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'HOTEL_MANAGER';

-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "hotelId" TEXT;

-- CreateTable
CREATE TABLE "Hotel" (
    "id" TEXT NOT NULL,
    "managerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "city" TEXT,
    "address" TEXT,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "checkInTime" TEXT,
    "checkOutTime" TEXT,
    "contact" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hotel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HotelRoom" (
    "id" TEXT NOT NULL,
    "hotelId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "totalRooms" INTEGER NOT NULL DEFAULT 0,
    "nightlyRateCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HotelRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_managerId_key" ON "Hotel"("managerId");

-- CreateIndex
CREATE INDEX "Hotel_managerId_idx" ON "Hotel"("managerId");

-- CreateIndex
CREATE INDEX "HotelRoom_hotelId_idx" ON "HotelRoom"("hotelId");
