-- CreateEnum
CREATE TYPE "ContentType" AS ENUM ('LONG_FORM', 'SHORT');

-- CreateEnum
CREATE TYPE "ContentStatus" AS ENUM ('DRAFT', 'READY', 'UPLOADING', 'PROCESSING', 'SCHEDULED', 'PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "content_items" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "project_id" TEXT,
    "task_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category_id" TEXT NOT NULL DEFAULT '22',
    "made_for_kids" BOOLEAN NOT NULL DEFAULT false,
    "content_type" "ContentType" NOT NULL DEFAULT 'LONG_FORM',
    "status" "ContentStatus" NOT NULL DEFAULT 'DRAFT',
    "scheduled_at" TIMESTAMP(3),
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "youtube_video_id" TEXT,
    "youtube_url" TEXT,
    "upload_progress" INTEGER NOT NULL DEFAULT 0,
    "processing_status" TEXT,
    "published_at" TIMESTAMP(3),
    "error_message" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "content_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "youtube_connections" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "channel_title" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "youtube_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "content_items_profile_id_created_at_idx" ON "content_items"("profile_id", "created_at");

-- CreateIndex
CREATE INDEX "content_items_task_id_idx" ON "content_items"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "youtube_connections_profile_id_key" ON "youtube_connections"("profile_id");

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_items" ADD CONSTRAINT "content_items_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "youtube_connections" ADD CONSTRAINT "youtube_connections_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
