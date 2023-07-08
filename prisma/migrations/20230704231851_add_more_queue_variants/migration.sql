/*
  Warnings:

  - The values [QUEUE] on the enum `AntiSpamAction` will be removed. If these variants are still used in the database, this will fail.
*/
-- AlterEnum
BEGIN;
CREATE TYPE "AntiSpamAction_new" AS ENUM ('BAN', 'KICK', 'QUEUE_BAN', 'QUEUE_KICK');
ALTER TABLE "AntiSpamActionMapping" ALTER COLUMN "action" TYPE "AntiSpamAction_new" USING ("action"::text::"AntiSpamAction_new");
ALTER TYPE "AntiSpamAction" RENAME TO "AntiSpamAction_old";
ALTER TYPE "AntiSpamAction_new" RENAME TO "AntiSpamAction";
DROP TYPE "AntiSpamAction_old";
COMMIT;