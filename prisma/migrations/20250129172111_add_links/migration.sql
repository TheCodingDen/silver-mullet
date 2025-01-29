-- CreateEnum
CREATE TYPE "DomainVerdict" AS ENUM ('MALICIOUS', 'BENIGN');

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawResult" JSONB NOT NULL,
    "verdict" "DomainVerdict" NOT NULL,
    "categories" TEXT[],
    "redirects" TEXT[],
    "reportURL" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "caughtURL" TEXT NOT NULL,
    "guildID" TEXT NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);
