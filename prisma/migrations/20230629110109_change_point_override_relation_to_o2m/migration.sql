/*
  Warnings:

  - You are about to drop the `_pointOverrides` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `settingsVersion` to the `PointOverride` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "_pointOverrides" DROP CONSTRAINT "_pointOverrides_A_fkey";

-- DropForeignKey
ALTER TABLE "_pointOverrides" DROP CONSTRAINT "_pointOverrides_B_fkey";

-- AlterTable
ALTER TABLE "PointOverride" ADD COLUMN     "settingsVersion" INTEGER NOT NULL;

-- DropTable
DROP TABLE "_pointOverrides";

-- AddForeignKey
ALTER TABLE "PointOverride" ADD CONSTRAINT "PointOverride_settingsVersion_fkey" FOREIGN KEY ("settingsVersion") REFERENCES "CrossChannelAntiSpamSettings"("version") ON DELETE RESTRICT ON UPDATE CASCADE;
