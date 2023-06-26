-- CreateEnum
CREATE TYPE "IgnoreTarget" AS ENUM ('CATEGORY', 'CHANNEL', 'ROLE');

-- CreateTable
CREATE TABLE "Ignore" (
    "id" TEXT NOT NULL,
    "type" "IgnoreTarget" NOT NULL,
    "snowflake" TEXT NOT NULL,

    CONSTRAINT "Ignore_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Ignore_snowflake_key" ON "Ignore"("snowflake");
