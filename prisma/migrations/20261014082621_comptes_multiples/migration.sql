-- AlterTable
ALTER TABLE "upload_sessions" ADD COLUMN     "providerId" TEXT;

-- CreateTable
CREATE TABLE "project_storage_folders" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "folderId" TEXT NOT NULL,

    CONSTRAINT "project_storage_folders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "project_storage_folders_projectId_providerId_key" ON "project_storage_folders"("projectId", "providerId");

-- AddForeignKey
ALTER TABLE "project_storage_folders" ADD CONSTRAINT "project_storage_folders_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_storage_folders" ADD CONSTRAINT "project_storage_folders_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "storage_providers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
