CREATE TABLE "customers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" varchar(20) NOT NULL,
	"name" varchar(200),
	"cost_file_count" integer DEFAULT 0,
	"needs_name_mapping" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "customers_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token" varchar(100) NOT NULL,
	"normalized_name" varchar(200) NOT NULL,
	"source_flags" varchar(200),
	"schedule_vendor_count" integer DEFAULT 0,
	"shipping_vendor_count" integer DEFAULT 0,
	"status_token_count" integer DEFAULT 0,
	"needs_manual_review" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "vendors_token_unique" UNIQUE("token")
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "stage" varchar(50);--> statement-breakpoint
CREATE INDEX "idx_vendors_normalized" ON "vendors" USING btree ("normalized_name");