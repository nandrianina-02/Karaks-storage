-- CreateEnum
CREATE TYPE "MigrationStatus" AS ENUM ('RUNNING', 'DONE', 'FAILED');

-- AlterEnum
ALTER TYPE "ProviderKind" ADD VALUE 'S3';

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'MIGRATE_STORAGE';

-- AlterTable
ALTER TABLE "storage_providers" ADD COLUMN     "config" JSONB,
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "provider_migrations" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fromProviderId" TEXT NOT NULL,
    "toProviderId" TEXT NOT NULL,
    "status" "MigrationStatus" NOT NULL DEFAULT 'RUNNING',
    "totalFiles" INTEGER NOT NULL,
    "movedFiles" INTEGER NOT NULL DEFAULT 0,
    "totalBytes" BIGINT NOT NULL,
    "movedBytes" BIGINT NOT NULL DEFAULT 0,
    "currentFileId" TEXT,
    "currentSession" TEXT,
    "currentOffset" BIGINT NOT NULL DEFAULT 0,
    "sourceFolders" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "error" TEXT,
    "startedById" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "provider_migrations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_migrations_status_idx" ON "provider_migrations"("status");

-- AddForeignKey
ALTER TABLE "provider_migrations" ADD CONSTRAINT "provider_migrations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_migrations" ADD CONSTRAINT "provider_migrations_fromProviderId_fkey" FOREIGN KEY ("fromProviderId") REFERENCES "storage_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "provider_migrations" ADD CONSTRAINT "provider_migrations_toProviderId_fkey" FOREIGN KEY ("toProviderId") REFERENCES "storage_providers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
