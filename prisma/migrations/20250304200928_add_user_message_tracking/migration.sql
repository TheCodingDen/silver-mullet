-- CreateTable
CREATE TABLE "LastSeen" (
    "userId" TEXT NOT NULL,
    "lastMessageId" TEXT NOT NULL,
    "lastMessageDate" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LastSeen_pkey" PRIMARY KEY ("userId")
);
