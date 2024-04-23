-- CreateEnum
CREATE TYPE "FilterMode" AS ENUM ('DEBUG', 'ACTIVE');

-- AlterTable
ALTER TABLE "Filter" ADD COLUMN     "mode" "FilterMode" NOT NULL DEFAULT 'ACTIVE';
