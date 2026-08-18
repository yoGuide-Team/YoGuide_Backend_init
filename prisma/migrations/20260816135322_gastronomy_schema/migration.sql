-- AlterTable
ALTER TABLE "Booking" ADD COLUMN     "partySize" INTEGER,
ALTER COLUMN "packageId" DROP NOT NULL,
ALTER COLUMN "vehicleId" DROP NOT NULL,
ALTER COLUMN "pickupLocation" DROP NOT NULL;

-- CreateTable
CREATE TABLE "GastronomyCategory" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "iconKey" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GastronomyCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChefProfile" (
    "id" TEXT NOT NULL,
    "guideId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "restaurantName" TEXT,
    "experienceName" TEXT,
    "area" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "introVideoUrl" TEXT,
    "storyTitle" TEXT,
    "storyDurationLabel" TEXT,
    "storyText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChefProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChefCourse" (
    "id" TEXT NOT NULL,
    "chefId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChefCourse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChefPriceTier" (
    "id" TEXT NOT NULL,
    "chefId" TEXT NOT NULL,
    "minPartySize" INTEGER NOT NULL,
    "maxPartySize" INTEGER,
    "pricePerPersonUsd" DECIMAL(12,2) NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ChefPriceTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BookingCourse" (
    "bookingId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,

    CONSTRAINT "BookingCourse_pkey" PRIMARY KEY ("bookingId","courseId")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChefProfile_guideId_key" ON "ChefProfile"("guideId");

-- CreateIndex
CREATE INDEX "ChefProfile_categoryId_idx" ON "ChefProfile"("categoryId");

-- CreateIndex
CREATE INDEX "ChefCourse_chefId_idx" ON "ChefCourse"("chefId");

-- CreateIndex
CREATE INDEX "ChefPriceTier_chefId_idx" ON "ChefPriceTier"("chefId");

-- CreateIndex
CREATE INDEX "BookingCourse_courseId_idx" ON "BookingCourse"("courseId");
