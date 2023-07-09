/*
  Warnings:

  - You are about to drop the column `points` on the `AntiSpamRule` table. All the data in the column will be lost.
  - Changed the type of `action` on the `AntiSpamRule` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `AntiSpamRule` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterEnum
ALTER TYPE "AntiSpamAction" ADD VALUE 'NOTHING';

-- AlterTable
ALTER TABLE "AntiSpamRule" DROP COLUMN "points",
ADD COLUMN     "pointThreshold" INTEGER,
ADD COLUMN     "triggeringPhrase" TEXT,
DROP COLUMN "action",
ADD COLUMN     "action" "AntiSpamAction" NOT NULL,
DROP COLUMN "type",
ADD COLUMN     "type" "AntiSpamType" NOT NULL;

