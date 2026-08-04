-- CreateEnum
CREATE TYPE "FeedbackType" AS ENUM ('BUG', 'CONFUSING', 'MISSING_FEATURE', 'IMPROVEMENT');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('NEW', 'REVIEWING', 'FIXED', 'DISMISSED');

-- CreateTable
CREATE TABLE "feedback" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "type" "FeedbackType" NOT NULL,
    "description" TEXT NOT NULL,
    "page" TEXT NOT NULL,
    "task_id" TEXT,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'NEW',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "feedback_profile_id_created_at_idx" ON "feedback"("profile_id", "created_at");

-- AddForeignKey
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
