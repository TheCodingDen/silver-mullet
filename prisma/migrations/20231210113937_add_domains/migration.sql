-- CreateEnum
CREATE TYPE "DomainType" AS ENUM ('IGNORED', 'ACTIONABLE');

-- CreateTable
CREATE TABLE "Domain" (
    "id" TEXT NOT NULL,
    "type" "DomainType" NOT NULL,
    "domain" TEXT NOT NULL,
    "action" "AntiSpamAction",

    CONSTRAINT "Domain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Domain_domain_key" ON "Domain"("domain");
