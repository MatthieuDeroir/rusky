-- AlterTable
ALTER TABLE "Text" ADD COLUMN "newEntryIds" TEXT;

-- CreateTable
CREATE TABLE "Lesson" (
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "slot" TEXT NOT NULL,
    "reviewIds" TEXT NOT NULL DEFAULT '[]',
    "knownTextId" INTEGER,
    "newTextId" INTEGER,
    "reviewsDoneAt" DATETIME,
    "completedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY ("userId", "day", "slot")
);
