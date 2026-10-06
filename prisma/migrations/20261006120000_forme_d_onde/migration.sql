-- AlterTable
ALTER TABLE "files" ADD COLUMN     "waveform" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

-- AlterTable
ALTER TABLE "upload_sessions" ADD COLUMN     "waveform" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

