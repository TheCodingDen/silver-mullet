/*
  Warnings:

  - Added the required column `guildID` to the `PermissionGroupMapping` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "PermissionGroupMapping" ADD COLUMN     "guildID" TEXT NOT NULL;
