-- DropIndex
DROP INDEX "Batch_academicYearId_name_key";

-- CreateIndex
CREATE UNIQUE INDEX "Batch_academicYearId_siteId_name_key" ON "Batch"("academicYearId", "siteId", "name");

