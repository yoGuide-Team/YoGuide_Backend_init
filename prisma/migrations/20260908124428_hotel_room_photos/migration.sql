-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "HotelRoom" ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
