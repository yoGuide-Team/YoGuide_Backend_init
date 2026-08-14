-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regionId" TEXT,
    "label" TEXT,
    "arrivalDate" TIMESTAMP(3) NOT NULL,
    "departureDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Trip_userId_idx" ON "Trip"("userId");

-- CreateIndex
CREATE INDEX "Trip_regionId_idx" ON "Trip"("regionId");
