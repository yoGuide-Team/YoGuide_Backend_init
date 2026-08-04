/*
  Warnings:

  - Made the column `rating` on table `Tour` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "Tour" ALTER COLUMN "rating" SET NOT NULL;
