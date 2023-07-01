-- CreateEnum
CREATE TYPE "AntiSpamAction" AS ENUM ('BAN', 'KICK', 'QUEUE');

-- DropForeignKey
ALTER TABLE "PointOverride" DROP CONSTRAINT "PointOverride_settingsVersion_fkey";

-- CreateTable
CREATE TABLE "AntiSpamActionMapping" (
    "points" INTEGER NOT NULL,
    "action" "AntiSpamAction" NOT NULL,
    "settingsVersion" INTEGER,

    CONSTRAINT "AntiSpamActionMapping_pkey" PRIMARY KEY ("points","action")
);

-- AddForeignKey
ALTER TABLE "AntiSpamActionMapping" ADD CONSTRAINT "AntiSpamActionMapping_settingsVersion_fkey" FOREIGN KEY ("settingsVersion") REFERENCES "CrossChannelAntiSpamSettings"("version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointOverride" ADD CONSTRAINT "PointOverride_settingsVersion_fkey" FOREIGN KEY ("settingsVersion") REFERENCES "CrossChannelAntiSpamSettings"("version") ON DELETE CASCADE ON UPDATE CASCADE;
