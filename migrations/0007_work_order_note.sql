ALTER TABLE "work_orders" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "work_orders" ALTER COLUMN "route_id" DROP NOT NULL;
