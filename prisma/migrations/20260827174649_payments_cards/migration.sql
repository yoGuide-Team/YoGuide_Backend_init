-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('ACTIVE', 'FROZEN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CardTransactionStatus" AS ENUM ('PENDING', 'SETTLED', 'DISPUTED', 'FAILED');

-- AlterTable
ALTER TABLE "Hotel" ADD COLUMN     "code" TEXT;

-- CreateTable
CREATE TABLE "Card" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'virtual',
    "last4" TEXT NOT NULL,
    "pinHash" TEXT NOT NULL,
    "limitCents" INTEGER NOT NULL DEFAULT 0,
    "spentCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CardStatus" NOT NULL DEFAULT 'ACTIVE',
    "organization" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Card_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CardTransaction" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hotelId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" "CardTransactionStatus" NOT NULL DEFAULT 'SETTLED',
    "title" TEXT,
    "details" TEXT,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CardTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Card_userId_idx" ON "Card"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CardTransaction_reference_key" ON "CardTransaction"("reference");

-- CreateIndex
CREATE INDEX "CardTransaction_userId_idx" ON "CardTransaction"("userId");

-- CreateIndex
CREATE INDEX "CardTransaction_hotelId_idx" ON "CardTransaction"("hotelId");

-- CreateIndex
CREATE INDEX "CardTransaction_cardId_idx" ON "CardTransaction"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "Hotel_code_key" ON "Hotel"("code");

