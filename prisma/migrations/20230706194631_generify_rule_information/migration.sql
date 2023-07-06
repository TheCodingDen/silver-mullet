/*
  Warnings:

  - You are about to drop the `AntiSpamActionMapping` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "AntiSpamType" AS ENUM ('FILTER', 'SPAM');

-- DropForeignKey
ALTER TABLE "AntiSpamActionMapping" DROP CONSTRAINT "AntiSpamActionMapping_settingsVersion_fkey";

-- DropTable
DROP TABLE "AntiSpamActionMapping";

-- CreateTable
CREATE TABLE "AntiSpamRule" (
    "id" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "description" TEXT,
    "action" "AntiSpamAction" NOT NULL,
    "type" "AntiSpamType" NOT NULL,
    "settingsVersion" INTEGER,
    "parentId" TEXT,

    CONSTRAINT "AntiSpamRule_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AntiSpamRule" ADD CONSTRAINT "AntiSpamRule_settingsVersion_fkey" FOREIGN KEY ("settingsVersion") REFERENCES "CrossChannelAntiSpamSettings"("version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AntiSpamRule" ADD CONSTRAINT "AntiSpamRule_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "AntiSpamRule"("id") ON DELETE SET NULL ON UPDATE CASCADE;
