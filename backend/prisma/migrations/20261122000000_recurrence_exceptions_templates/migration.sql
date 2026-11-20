-- AlterTable
ALTER TABLE "recurrence_rules" ADD COLUMN     "occurrence_count" INTEGER;

-- AlterTable
ALTER TABLE "events" ADD COLUMN     "duration_minutes" INTEGER;

-- CreateTable
CREATE TABLE "event_exceptions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID NOT NULL,
    "original_start" TIMESTAMP(3) NOT NULL,
    "kind" VARCHAR(10) NOT NULL,
    "title" VARCHAR(150),
    "destination" VARCHAR(255),
    "notes" VARCHAR(2000),
    "start_at" TIMESTAMP(3),
    "travel_duration_minutes" INTEGER,
    "preparation_minutes" INTEGER,
    "arrival_buffer_minutes" INTEGER,
    "duration_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_exceptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_templates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "category" VARCHAR(20) NOT NULL,
    "destination" VARCHAR(255),
    "notes" VARCHAR(2000),
    "timezone" VARCHAR(64),
    "travel_duration_minutes" INTEGER NOT NULL,
    "preparation_minutes" INTEGER NOT NULL,
    "arrival_buffer_minutes" INTEGER NOT NULL,
    "duration_minutes" INTEGER,
    "recurrence" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "event_exceptions_user_id_event_id_idx" ON "event_exceptions"("user_id", "event_id");

-- CreateIndex
CREATE UNIQUE INDEX "event_exceptions_event_id_original_start_key" ON "event_exceptions"("event_id", "original_start");

-- CreateIndex
CREATE UNIQUE INDEX "event_templates_user_id_name_key" ON "event_templates"("user_id", "name");

-- AddForeignKey
ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_exceptions" ADD CONSTRAINT "event_exceptions_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_templates" ADD CONSTRAINT "event_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

