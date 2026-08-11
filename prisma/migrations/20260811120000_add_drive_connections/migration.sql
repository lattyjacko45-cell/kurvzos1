-- CreateTable
CREATE TABLE "drive_connections" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "account_email" TEXT NOT NULL,
    "encrypted_refresh_token" TEXT NOT NULL,
    "token_expires_at" TIMESTAMP(3),
    "granted_scopes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "drive_connections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "drive_connections_profile_id_key" ON "drive_connections"("profile_id");

-- AddForeignKey
ALTER TABLE "drive_connections" ADD CONSTRAINT "drive_connections_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Match the lock-down applied to every other public table: Prisma's database
-- owner remains the only access path. Without this the new table would be the
-- one exception reachable by Supabase's browser roles.
ALTER TABLE public.drive_connections ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated', 'service_role']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format(
        'REVOKE ALL PRIVILEGES ON TABLE public.drive_connections FROM %I',
        role_name
      );
    END IF;
  END LOOP;
END
$$;
