-- AlterTable
ALTER TABLE "upload_sessions" ADD COLUMN     "filePublicId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "signed_urls" ADD COLUMN     "expiredNotifiedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "upload_sessions_filePublicId_key" ON "upload_sessions"("filePublicId");

