/*
  Warnings:

  - Added the required column `guildId` to the `Ignore` table without a default value. This is not possible if the table is not empty.

*/

CREATE TABLE ignore_temp (
    id text,
    snowflake text,
    type "IgnoreTarget",
    "guildId" text
);

INSERT INTO ignore_temp (id, snowflake, type, "guildId")
SELECT
  id,
  snowflake,
  type,
  CASE WHEN snowflake = '731582778809909351' -- Only one ignore in the test guild
    THEN '731581715474153542' -- Test
    ELSE '172018499005317120' -- Main
  END AS "guildId"
FROM "Ignore";

TRUNCATE TABLE "Ignore";

-- AlterTable
ALTER TABLE "Ignore" ADD COLUMN     "guildId" TEXT NOT NULL;

INSERT INTO "Ignore" (id, snowflake, type, "guildId")
SELECT * FROM ignore_temp;

DROP TABLE ignore_temp;
