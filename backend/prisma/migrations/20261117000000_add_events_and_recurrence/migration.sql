-- CreateTable
CREATE TABLE "recurrence_rules" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "frequency" VARCHAR(10) NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "days_of_week" INTEGER[],
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurrence_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "start_at" TIMESTAMP(3) NOT NULL,
    "timezone" VARCHAR(64) NOT NULL,
    "destination" VARCHAR(255),
    "notes" VARCHAR(2000),
    "travel_duration_minutes" INTEGER NOT NULL,
    "preparation_minutes" INTEGER NOT NULL,
    "arrival_buffer_minutes" INTEGER NOT NULL,
    "is_recurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrence_rule_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_recurrence_rule_id_key" ON "events"("recurrence_rule_id");

-- CreateIndex
CREATE INDEX "events_user_id_start_at_idx" ON "events"("user_id", "start_at");

-- CreateIndex
CREATE INDEX "events_user_id_category_idx" ON "events"("user_id", "category");

-- AddForeignKey
ALTER TABLE "recurrence_rules" ADD CONSTRAINT "recurrence_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_recurrence_rule_id_fkey" FOREIGN KEY ("recurrence_rule_id") REFERENCES "recurrence_rules"("id") ON DELETE SET NULL ON UPDATE CASCADE;

