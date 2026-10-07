-- CreateEnum
CREATE TYPE "ProjectPlan" AS ENUM ('ESSAI', 'STANDARD', 'PRO', 'SUR_MESURE');

-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "plan" "ProjectPlan" NOT NULL DEFAULT 'SUR_MESURE';
