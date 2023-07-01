-- CreateEnum
CREATE TYPE "AntiSpamAction" AS ENUM ('BAN', 'KICK', 'QUEUE');

-- CreateTable
CREATE TABLE "AntiSpamActionMapping" (
    "points" INTEGER NOT NULL,
    "action" "AntiSpamAction" NOT NULL,
    "settingsVersion" INTEGER,

    CONSTRAINT "AntiSpamActionMapping_pkey" PRIMARY KEY ("points","action")
);

-- AddForeignKey
ALTER TABLE "AntiSpamActionMapping" ADD CONSTRAINT "AntiSpamActionMapping_settingsVersion_fkey" FOREIGN KEY ("settingsVersion") REFERENCES "CrossChannelAntiSpamSettings"("version") ON DELETE SET NULL ON UPDATE CASCADE;
