-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_placeId_fkey";

-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_userId_fkey";

-- DropForeignKey
ALTER TABLE "BookingTransaction" DROP CONSTRAINT "BookingTransaction_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "Event" DROP CONSTRAINT "Event_cityId_fkey";

-- DropForeignKey
ALTER TABLE "GuideDocument" DROP CONSTRAINT "GuideDocument_guideId_fkey";

-- DropForeignKey
ALTER TABLE "ItineraryItem" DROP CONSTRAINT "ItineraryItem_itineraryId_fkey";

-- DropForeignKey
ALTER TABLE "Message" DROP CONSTRAINT "Message_threadId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_orderId_fkey";

-- DropForeignKey
ALTER TABLE "OrderItem" DROP CONSTRAINT "OrderItem_productId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_vendorId_fkey";

-- DropForeignKey
ALTER TABLE "Tour" DROP CONSTRAINT "Tour_cityId_fkey";

-- DropForeignKey
ALTER TABLE "TourStop" DROP CONSTRAINT "TourStop_tourId_fkey";

-- DropForeignKey
ALTER TABLE "User" DROP CONSTRAINT "User_roleKey_fkey";

-- DropForeignKey
ALTER TABLE "Wallet" DROP CONSTRAINT "Wallet_userId_fkey";

-- DropForeignKey
ALTER TABLE "WalletTransaction" DROP CONSTRAINT "WalletTransaction_bookingId_fkey";

-- DropForeignKey
ALTER TABLE "WalletTransaction" DROP CONSTRAINT "WalletTransaction_walletId_fkey";

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "cardNumber" TEXT,
ADD COLUMN     "phone" TEXT;

-- AlterTable
ALTER TABLE "WalletTransaction" ADD COLUMN     "cardToken" TEXT,
ADD COLUMN     "method" TEXT,
ADD COLUMN     "rwfAmount" DOUBLE PRECISION,
ADD COLUMN     "sourceAmount" DOUBLE PRECISION,
ADD COLUMN     "sourceCurrency" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "userId" TEXT,
ALTER COLUMN "walletId" DROP NOT NULL,
ALTER COLUMN "kind" DROP NOT NULL,
ALTER COLUMN "amountCents" DROP NOT NULL;

-- CreateTable
CREATE TABLE "EsimOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bundleId" TEXT NOT NULL,
    "deliveryEmail" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EsimOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShuttleBooking" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "dropOffPoint" TEXT NOT NULL,
    "slotTime" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'confirmed',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShuttleBooking_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "destinationCity" TEXT NOT NULL,
    "arrivalDate" TIMESTAMP(3),
    "departureDate" TIMESTAMP(3),
    "tripPurpose" TEXT,
    "nationality" TEXT,
    "freeSlots" TEXT,
    "experienceTypes" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TripProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventIds" TEXT[],
    "reminderEnabled" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TripProfile_userId_key" ON "TripProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EventInterest_userId_key" ON "EventInterest"("userId");
