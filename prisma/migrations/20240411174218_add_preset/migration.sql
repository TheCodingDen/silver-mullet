-- CreateTable
CREATE TABLE "Preset" (
    "name" TEXT NOT NULL,
    "regex" TEXT NOT NULL,
    "flags" TEXT NOT NULL DEFAULT 'g',
    "guildID" TEXT NOT NULL,
    "filterId" TEXT,

    CONSTRAINT "Preset_pkey" PRIMARY KEY ("name")
);

-- AddForeignKey
ALTER TABLE "Preset" ADD CONSTRAINT "Preset_filterId_fkey" FOREIGN KEY ("filterId") REFERENCES "Filter"("id") ON DELETE SET NULL ON UPDATE CASCADE;
