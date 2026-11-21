-- AlterTable
ALTER TABLE "events" ADD COLUMN     "priority" VARCHAR(8) NOT NULL DEFAULT 'normal';

-- AlterTable
ALTER TABLE "checklist_items" ADD COLUMN     "completed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "snoozed_until" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "notifications_user_id_snoozed_until_idx" ON "notifications"("user_id", "snoozed_until");

