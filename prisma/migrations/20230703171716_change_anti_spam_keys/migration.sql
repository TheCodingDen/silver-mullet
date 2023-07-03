/*
  Warnings:

  - The primary key for the `AntiSpamActionMapping` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - The required column `id` was added to the `AntiSpamActionMapping` table with a prisma-level default value. This is not possible if the table is not empty. Please add this column as optional, then populate it before making it required.
  - Changed the type of `action` on the `AntiSpamActionMapping` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `type` on the `Ignore` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `group` on the `PermissionGroupMapping` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- AlterTable
ALTER TABLE "AntiSpamActionMapping" DROP CONSTRAINT "AntiSpamActionMapping_pkey",
ADD COLUMN     "id" TEXT NOT NULL,
DROP COLUMN "action",
ADD COLUMN     "action" "AntiSpamAction" NOT NULL,
ADD CONSTRAINT "AntiSpamActionMapping_pkey" PRIMARY KEY ("id");

-- AlterTable
ALTER TABLE "Ignore" DROP COLUMN "type",
ADD COLUMN     "type" "IgnoreTarget" NOT NULL;

-- AlterTable
ALTER TABLE "PermissionGroupMapping" DROP COLUMN "group",
ADD COLUMN     "group" "PermissionGroup" NOT NULL;
