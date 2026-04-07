-- device_tokens: one-time registration tokens for BYOD device setup
CREATE TABLE "device_tokens" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "token" varchar(20) NOT NULL,
  "is_used" boolean DEFAULT false NOT NULL,
  "device_id" uuid REFERENCES "devices"("id"),
  "created_at" timestamptz DEFAULT now(),
  "used_at" timestamptz,
  CONSTRAINT "device_tokens_token_unique" UNIQUE("token")
);

CREATE INDEX "idx_device_tokens_token" ON "device_tokens" ("token");
CREATE INDEX "idx_device_tokens_used" ON "device_tokens" ("is_used");
