/*
  Warnings:

  - You are about to drop the column `maxTimeDiffMinutes` on the `CrossChannelAntiSpamSettings` table. All the data in the column will be lost.
  - You are about to drop the column `pointRequirement` on the `CrossChannelAntiSpamSettings` table. All the data in the column will be lost.
  - Added the required column `cacheTTLSeconds` to the `CrossChannelAntiSpamSettings` table without a default value. This is not possible if the table is not empty.
*/

-- AlterTable
ALTER TABLE "CrossChannelAntiSpamSettings" DROP COLUMN "maxTimeDiffMinutes",
DROP COLUMN "pointRequirement",
ADD COLUMN     "cacheTTLSeconds" INTEGER NOT NULL;

