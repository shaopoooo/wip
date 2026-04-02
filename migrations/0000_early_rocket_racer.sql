CREATE TABLE "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role_id" uuid,
	"is_active" boolean DEFAULT true,
	"external_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "admin_users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" uuid NOT NULL,
	"action" varchar(20) NOT NULL,
	"changes" jsonb,
	"device_id" uuid,
	"operator_id" uuid,
	"ip_address" "inet",
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "defect_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_log_id" uuid NOT NULL,
	"defect_type" varchar(50) NOT NULL,
	"defect_name" varchar(200) NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"severity" varchar(10) DEFAULT 'minor',
	"disposition" varchar(20),
	"note" text,
	"image_url" varchar(500),
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "departments_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"name" varchar(100),
	"device_type" varchar(20) NOT NULL,
	"user_agent" text,
	"screen_info" jsonb,
	"timezone" varchar(50),
	"webgl_renderer" varchar(200),
	"ip_address" "inet",
	"employee_id" varchar(50),
	"is_active" boolean DEFAULT true,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "equipment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"station_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"model" varchar(100),
	"serial_number" varchar(100),
	"is_active" boolean DEFAULT true,
	"calibration_due" date,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20),
	"description" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_groups_dept_name" UNIQUE("department_id","name"),
	CONSTRAINT "uq_groups_dept_code" UNIQUE("department_id","code")
);
--> statement-breakpoint
CREATE TABLE "process_routes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"version" integer DEFAULT 1,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_routes_dept_name_ver" UNIQUE("department_id","name","version")
);
--> statement-breakpoint
CREATE TABLE "process_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"route_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"step_order" integer NOT NULL,
	"is_optional" boolean DEFAULT false,
	"condition_expr" jsonb,
	"standard_time" integer,
	"next_step_id" uuid,
	"rework_step_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"model_number" varchar(50) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"bom_version" varchar(20),
	"unit_cost" numeric(12, 2),
	"category" varchar(50),
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_products_dept_model" UNIQUE("department_id","model_number")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "roles_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "split_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_work_order_id" uuid NOT NULL,
	"child_work_order_ids" uuid[] NOT NULL,
	"split_reason" varchar(20) NOT NULL,
	"split_note" text,
	"qty_before_split" integer NOT NULL,
	"qty_distribution" jsonb NOT NULL,
	"device_id" uuid,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "station_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_order_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"equipment_id" uuid,
	"device_id" uuid NOT NULL,
	"operator_id" uuid,
	"step_id" uuid NOT NULL,
	"check_in_time" timestamp with time zone NOT NULL,
	"check_out_time" timestamp with time zone,
	"actual_qty_in" integer,
	"actual_qty_out" integer,
	"defect_qty" integer DEFAULT 0,
	"status" varchar(20) NOT NULL,
	"machine_params" jsonb,
	"serial_number" varchar(100),
	"parent_log_id" uuid,
	"material_batch_ids" jsonb,
	"previous_log_id" uuid,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_station_logs_wo_station_checkin" UNIQUE("work_order_id","station_id","check_in_time")
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"group_id" uuid,
	"name" varchar(100) NOT NULL,
	"code" varchar(20),
	"description" text,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "uq_stations_dept_name" UNIQUE("department_id","name"),
	CONSTRAINT "uq_stations_dept_code" UNIQUE("department_id","code")
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department_id" uuid NOT NULL,
	"order_number" varchar(50) NOT NULL,
	"product_id" uuid NOT NULL,
	"route_id" uuid NOT NULL,
	"planned_qty" integer NOT NULL,
	"status" varchar(20) NOT NULL,
	"priority" varchar(10) DEFAULT 'normal',
	"due_date" date,
	"parent_work_order_id" uuid,
	"split_reason" varchar(20),
	"is_split" boolean DEFAULT false,
	"sales_order_id" uuid,
	"scheduled_start" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "work_orders_order_number_unique" UNIQUE("order_number"),
	CONSTRAINT "chk_positive_qty" CHECK ("work_orders"."planned_qty" > 0)
);
--> statement-breakpoint
ALTER TABLE "admin_users" ADD CONSTRAINT "admin_users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "defect_records" ADD CONSTRAINT "defect_records_station_log_id_station_logs_id_fk" FOREIGN KEY ("station_log_id") REFERENCES "public"."station_logs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment" ADD CONSTRAINT "equipment_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_routes" ADD CONSTRAINT "process_routes_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_route_id_process_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."process_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "process_steps" ADD CONSTRAINT "process_steps_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_logs" ADD CONSTRAINT "split_logs_parent_work_order_id_work_orders_id_fk" FOREIGN KEY ("parent_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "split_logs" ADD CONSTRAINT "split_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_logs" ADD CONSTRAINT "station_logs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_logs" ADD CONSTRAINT "station_logs_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_logs" ADD CONSTRAINT "station_logs_equipment_id_equipment_id_fk" FOREIGN KEY ("equipment_id") REFERENCES "public"."equipment"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_logs" ADD CONSTRAINT "station_logs_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "station_logs" ADD CONSTRAINT "station_logs_step_id_process_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."process_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stations" ADD CONSTRAINT "stations_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_route_id_process_routes_id_fk" FOREIGN KEY ("route_id") REFERENCES "public"."process_routes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_parent_work_order_id_work_orders_id_fk" FOREIGN KEY ("parent_work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_audit_entity" ON "audit_logs" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_audit_time" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_defects_log" ON "defect_records" USING btree ("station_log_id");--> statement-breakpoint
CREATE INDEX "idx_devices_station" ON "devices" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "idx_equipment_station" ON "equipment" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "idx_groups_dept" ON "groups" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_routes_dept" ON "process_routes" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_products_dept" ON "products" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_station_logs_wo" ON "station_logs" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "idx_station_logs_station" ON "station_logs" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "idx_station_logs_time" ON "station_logs" USING btree ("check_in_time");--> statement-breakpoint
CREATE INDEX "idx_station_logs_device" ON "station_logs" USING btree ("device_id");--> statement-breakpoint
CREATE INDEX "idx_stations_dept" ON "stations" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "idx_stations_group" ON "stations" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "idx_work_orders_parent" ON "work_orders" USING btree ("parent_work_order_id");--> statement-breakpoint
CREATE INDEX "idx_work_orders_status" ON "work_orders" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_work_orders_dept" ON "work_orders" USING btree ("department_id");