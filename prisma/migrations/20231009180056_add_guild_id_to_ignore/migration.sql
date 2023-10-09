/*
  Warnings:

  - Added the required column `guildId` to the `Ignore` table without a default value. This is not possible if the table is not empty.

*/

-- AlterTable
ALTER TABLE "Ignore" ADD COLUMN     "guildId" TEXT NOT NULL;
