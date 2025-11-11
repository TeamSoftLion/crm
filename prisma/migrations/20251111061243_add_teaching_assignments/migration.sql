-- CreateEnum
CREATE TYPE "TeacherRole" AS ENUM ('LEAD', 'ASSISTANT', 'SUBSTITUTE');

-- CreateTable
CREATE TABLE "TeachingAssignment" (
    "id" TEXT NOT NULL,
    "teacherId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3),
    "role" "TeacherRole" NOT NULL DEFAULT 'LEAD',
    "inheritSchedule" BOOLEAN NOT NULL DEFAULT true,
    "daysPatternOverride" "DaysPattern",
    "startMinutesOverride" INTEGER,
    "endMinutesOverride" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "assignedBy" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deactivatedAt" TIMESTAMP(3),
    "deactivatedBy" TEXT,
    "deactivateReason" TEXT,

    CONSTRAINT "TeachingAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TeachingAssignment_teacherId_isActive_idx" ON "TeachingAssignment"("teacherId", "isActive");

-- CreateIndex
CREATE INDEX "TeachingAssignment_groupId_isActive_idx" ON "TeachingAssignment"("groupId", "isActive");

-- CreateIndex
CREATE INDEX "TeachingAssignment_fromDate_idx" ON "TeachingAssignment"("fromDate");

-- CreateIndex
CREATE INDEX "TeachingAssignment_toDate_idx" ON "TeachingAssignment"("toDate");

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "TeacherProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeachingAssignment" ADD CONSTRAINT "TeachingAssignment_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "Group"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
