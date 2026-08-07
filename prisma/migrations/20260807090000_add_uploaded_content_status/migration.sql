-- Adds a truthful state for a video that is on YouTube and finished
-- processing, but is private with no publish time set. Previously such videos
-- had no matching state and were left showing PROCESSING indefinitely.
--
-- Additive only: no existing row changes value.
ALTER TYPE "ContentStatus" ADD VALUE IF NOT EXISTS 'UPLOADED' BEFORE 'SCHEDULED';
