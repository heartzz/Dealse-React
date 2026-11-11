-- CreateEnum
CREATE TYPE "deal_report_reason" AS ENUM ('misleading', 'expired', 'inappropriate', 'other');

-- CreateEnum
CREATE TYPE "deal_report_status" AS ENUM ('open', 'resolved', 'dismissed');

-- AlterEnum
ALTER TYPE "account_role" ADD VALUE 'admin';

-- AlterTable
ALTER TABLE "deals" ADD COLUMN     "moderation_hold_at" TIMESTAMPTZ(6),
ADD COLUMN     "moderation_hold_by_user_id" UUID,
ADD COLUMN     "moderation_reason" VARCHAR(500);

-- CreateTable
CREATE TABLE "deal_reports" (
    "id" UUID NOT NULL,
    "deal_id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "reason" "deal_report_reason" NOT NULL,
    "details" VARCHAR(1000),
    "status" "deal_report_status" NOT NULL DEFAULT 'open',
    "resolution" VARCHAR(1000),
    "reviewed_by_user_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "deal_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deal_reports_status_created_at_idx" ON "deal_reports"("status", "created_at");

-- CreateIndex
CREATE INDEX "deal_reports_reporter_user_id_created_at_idx" ON "deal_reports"("reporter_user_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "deal_reports_deal_id_reporter_user_id_key" ON "deal_reports"("deal_id", "reporter_user_id");

-- AddForeignKey
ALTER TABLE "deals" ADD CONSTRAINT "deals_moderation_hold_by_user_id_fkey" FOREIGN KEY ("moderation_hold_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_deal_id_fkey" FOREIGN KEY ("deal_id") REFERENCES "deals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deal_reports" ADD CONSTRAINT "deal_reports_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
