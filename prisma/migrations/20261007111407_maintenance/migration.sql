-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "trashRetentionDays" INTEGER NOT NULL DEFAULT 30;

-- AlterTable
ALTER TABLE "webhook_deliveries" ADD COLUMN     "attempt" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "maintenance_runs" (
    "id" TEXT NOT NULL,
    "trigger" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "report" JSONB,
    "error" TEXT,

    CONSTRAINT "maintenance_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "maintenance_runs_startedAt_idx" ON "maintenance_runs"("startedAt");

-- CreateIndex
CREATE INDEX "webhook_deliveries_nextAttemptAt_idx" ON "webhook_deliveries"("nextAttemptAt");
