ALTER TABLE "process_routes" ADD COLUMN "is_template" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "process_routes" ADD COLUMN "template_type" varchar(50);
