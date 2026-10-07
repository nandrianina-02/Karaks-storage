-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailOptOut" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "alert_states" (
    "key" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alert_states_pkey" PRIMARY KEY ("key")
);
