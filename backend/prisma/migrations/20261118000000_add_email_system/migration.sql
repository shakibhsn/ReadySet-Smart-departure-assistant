-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verification_required" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_verified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "user_preferences" ADD COLUMN     "email_departure_reminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_prep_reminders" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "email_upcoming_reminders" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "auth_tokens" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(20) NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "new_email" VARCHAR(254),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "email_type" VARCHAR(40) NOT NULL,
    "recipient" VARCHAR(254) NOT NULL,
    "provider" VARCHAR(20) NOT NULL,
    "provider_message_id" VARCHAR(100),
    "status" VARCHAR(12) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error_code" VARCHAR(60),
    "dedupe_key" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "auth_tokens_token_hash_key" ON "auth_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "auth_tokens_user_id_type_idx" ON "auth_tokens"("user_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "email_logs_dedupe_key_key" ON "email_logs"("dedupe_key");

-- CreateIndex
CREATE INDEX "email_logs_user_id_email_type_idx" ON "email_logs"("user_id", "email_type");

-- AddForeignKey
ALTER TABLE "auth_tokens" ADD CONSTRAINT "auth_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

