-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "browser_notifications_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "notification_lead_minutes" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "notifications_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_checklist" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_departure" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_prep" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "notify_upcoming" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "type" VARCHAR(30) NOT NULL,
    "category" VARCHAR(12) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "body" VARCHAR(400) NOT NULL,
    "occurrence_start" TIMESTAMP(3),
    "dedupe_key" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "notifications_dedupe_key_key" ON "notifications"("dedupe_key");

-- CreateIndex
CREATE INDEX "notifications_user_id_created_at_idx" ON "notifications"("user_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_idx" ON "notifications"("user_id", "read_at");

-- CreateIndex
CREATE INDEX "notifications_event_id_idx" ON "notifications"("event_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

