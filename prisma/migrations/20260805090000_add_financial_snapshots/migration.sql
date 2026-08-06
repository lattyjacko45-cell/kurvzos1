-- CreateTable
CREATE TABLE "financial_snapshots" (
    "id" TEXT NOT NULL,
    "profile_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "revenue_cents" INTEGER NOT NULL DEFAULT 0,
    "operating_expenses_cents" INTEGER NOT NULL DEFAULT 0,
    "marketing_spend_cents" INTEGER NOT NULL DEFAULT 0,
    "available_cash_cents" INTEGER NOT NULL DEFAULT 0,
    "target_revenue_cents" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "financial_snapshots_profile_id_period_start_idx" ON "financial_snapshots"("profile_id", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "financial_snapshots_profile_id_period_start_key" ON "financial_snapshots"("profile_id", "period_start");

-- AddForeignKey
ALTER TABLE "financial_snapshots" ADD CONSTRAINT "financial_snapshots_profile_id_fkey" FOREIGN KEY ("profile_id") REFERENCES "profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;
