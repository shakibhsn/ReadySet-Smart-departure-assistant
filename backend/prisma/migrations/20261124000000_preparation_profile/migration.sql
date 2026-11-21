-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "adaptive_profile_enabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "preparation_overrides" JSONB;

-- CreateTable
CREATE TABLE "preparation_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "occurrence_start" TIMESTAMP(3) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "planned_prep_minutes" INTEGER NOT NULL,
    "planned_departure_at" TIMESTAMP(3) NOT NULL,
    "prep_started_at" TIMESTAMP(3),
    "ready_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "left_at" TIMESTAMP(3),
    "unchecked_items" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preparation_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preparation_logs_user_id_occurrence_start_idx" ON "preparation_logs"("user_id", "occurrence_start" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "preparation_logs_user_id_event_id_occurrence_start_key" ON "preparation_logs"("user_id", "event_id", "occurrence_start");

-- AddForeignKey
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "preparation_logs" ADD CONSTRAINT "preparation_logs_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

