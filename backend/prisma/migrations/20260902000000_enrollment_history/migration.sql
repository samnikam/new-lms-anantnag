-- CreateEnum
CREATE TYPE "EnrollmentAction" AS ENUM ('ENROLLED', 'BATCH_CHANGED', 'TRANSFERRED', 'WITHDRAWN', 'REINSTATED', 'COMPLETED');

-- CreateTable
CREATE TABLE "EnrollmentHistory" (
    "id" TEXT NOT NULL,
    "enrollmentId" TEXT NOT NULL,
    "action" "EnrollmentAction" NOT NULL,
    "fromBatchId" TEXT,
    "toBatchId" TEXT,
    "fromStatus" "EnrollmentStatus",
    "toStatus" "EnrollmentStatus",
    "reason" TEXT,
    "changedById" TEXT,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EnrollmentHistory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EnrollmentHistory_enrollmentId_at_idx" ON "EnrollmentHistory"("enrollmentId", "at");

-- AddForeignKey
ALTER TABLE "EnrollmentHistory" ADD CONSTRAINT "EnrollmentHistory_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "Enrollment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

