-- CreateEnum
CREATE TYPE "Executive" AS ENUM ('HARPER', 'RENEE', 'SOPHIA', 'OLIVIA', 'MARCUS');

-- CreateTable
CREATE TABLE "executive_conversations" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "executive" "Executive" NOT NULL DEFAULT 'HARPER',
    "user_message" TEXT,
    "response" JSONB NOT NULL,
    "context_snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "executive_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "executive_conversations_profile_id_executive_created_at_idx" ON "executive_conversations"("profile_id", "executive", "created_at");

-- AddForeignKey
ALTER TABLE "executive_conversations" ADD CONSTRAINT "executive_conversations_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
