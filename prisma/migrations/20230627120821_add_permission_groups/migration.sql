-- CreateEnum
CREATE TYPE "PermissionGroup" AS ENUM ('ROOT', 'INFRA_ADMIN', 'ADMIN', 'MODERATOR');

-- CreateTable
CREATE TABLE "PermissionGroupMapping" (
    "id" TEXT NOT NULL,
    "roleID" TEXT NOT NULL,
    "group" "PermissionGroup" NOT NULL,

    CONSTRAINT "PermissionGroupMapping_pkey" PRIMARY KEY ("id")
);
