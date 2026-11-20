-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "default_start_place_id" UUID;

-- CreateTable
CREATE TABLE "packing_templates" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "items" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "packing_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forgotten_item_reports" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "event_id" UUID,
    "item_text" VARCHAR(120) NOT NULL,
    "text_key" VARCHAR(120) NOT NULL,
    "reported_on" DATE NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forgotten_item_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_places" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "label" VARCHAR(60) NOT NULL,
    "kind" VARCHAR(12) NOT NULL,
    "address" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_places_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "packing_templates_user_id_name_key" ON "packing_templates"("user_id", "name");

-- CreateIndex
CREATE INDEX "forgotten_item_reports_user_id_text_key_idx" ON "forgotten_item_reports"("user_id", "text_key");

-- CreateIndex
CREATE UNIQUE INDEX "forgotten_item_reports_user_id_event_id_text_key_reported_o_key" ON "forgotten_item_reports"("user_id", "event_id", "text_key", "reported_on");

-- CreateIndex
CREATE INDEX "saved_places_user_id_idx" ON "saved_places"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_places_user_id_label_key" ON "saved_places"("user_id", "label");

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_default_start_place_id_fkey" FOREIGN KEY ("default_start_place_id") REFERENCES "saved_places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "packing_templates" ADD CONSTRAINT "packing_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forgotten_item_reports" ADD CONSTRAINT "forgotten_item_reports_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forgotten_item_reports" ADD CONSTRAINT "forgotten_item_reports_event_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_places" ADD CONSTRAINT "saved_places_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

