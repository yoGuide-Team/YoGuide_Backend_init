-- CreateEnum
CREATE TYPE "IdentityStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "identityDocUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "identityRejectionReason" TEXT,
ADD COLUMN     "identityStatus" "IdentityStatus" NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "type" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "transactionId" TEXT,
    "actionLabel" TEXT,
    "actionUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Notification_userId_idx" ON "Notification"("userId");
