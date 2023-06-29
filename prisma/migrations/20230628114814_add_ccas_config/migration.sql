-- CreateTable
CREATE TABLE "CrossChannelAntiSpamSettings" (
    "version" SERIAL NOT NULL,
    "minMessageLength" INTEGER NOT NULL,
    "shortMessageLength" INTEGER NOT NULL,
    "shortMessageSimilarityThreshold" INTEGER NOT NULL,
    "similarityThreshold" INTEGER NOT NULL,
    "maxTimeDiffMinutes" INTEGER NOT NULL,
    "maxSizeDiffPercentage" INTEGER NOT NULL,
    "pointRequirement" INTEGER NOT NULL,
    "pointsOnMatch" INTEGER NOT NULL,

    CONSTRAINT "CrossChannelAntiSpamSettings_pkey" PRIMARY KEY ("version")
);

-- CreateTable
CREATE TABLE "PointOverride" (
    "id" TEXT NOT NULL,
    "word" TEXT NOT NULL,
    "points" INTEGER NOT NULL,

    CONSTRAINT "PointOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_pointOverrides" (
    "A" INTEGER NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "PointOverride_word_key" ON "PointOverride"("word");

-- CreateIndex
CREATE UNIQUE INDEX "_pointOverrides_AB_unique" ON "_pointOverrides"("A", "B");

-- CreateIndex
CREATE INDEX "_pointOverrides_B_index" ON "_pointOverrides"("B");

-- AddForeignKey
ALTER TABLE "_pointOverrides" ADD CONSTRAINT "_pointOverrides_A_fkey" FOREIGN KEY ("A") REFERENCES "CrossChannelAntiSpamSettings"("version") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_pointOverrides" ADD CONSTRAINT "_pointOverrides_B_fkey" FOREIGN KEY ("B") REFERENCES "PointOverride"("id") ON DELETE CASCADE ON UPDATE CASCADE;
