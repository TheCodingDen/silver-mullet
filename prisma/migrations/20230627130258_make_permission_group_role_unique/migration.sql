/*
  Warnings:

  - A unique constraint covering the columns `[roleID]` on the table `PermissionGroupMapping` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "PermissionGroupMapping_roleID_key" ON "PermissionGroupMapping"("roleID");
