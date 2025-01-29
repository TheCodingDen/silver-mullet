-- CreateEnum
CREATE TYPE "DomainVerdict" AS ENUM ('MALICIOUS', 'BENIGN');

-- CreateTable
CREATE TABLE "Link" (
    "id" TEXT NOT NULL,
    "verdict" "DomainVerdict" NOT NULL,
    "categories" TEXT[],
    "domain" TEXT NOT NULL,
    "caughtURL" TEXT NOT NULL,
    "guildID" TEXT NOT NULL,

    CONSTRAINT "Link_pkey" PRIMARY KEY ("id")
);
