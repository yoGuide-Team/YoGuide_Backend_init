-- DropJsonColumn
ALTER TABLE "Package" DROP COLUMN "tours";

-- CreateTable
CREATE TABLE "PackageTour" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "PackageTour_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PackageTour_packageId_idx" ON "PackageTour"("packageId");
