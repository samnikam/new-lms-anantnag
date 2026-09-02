-- CreateEnum
CREATE TYPE "InstitutionType" AS ENUM ('SCHOOL', 'INSTITUTE', 'CENTRE');

-- AlterTable
ALTER TABLE "Site" ADD COLUMN     "contactEmail" TEXT,
ADD COLUMN     "type" "InstitutionType" NOT NULL DEFAULT 'SCHOOL';

