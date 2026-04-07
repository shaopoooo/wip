-- product_categories table
CREATE TABLE "product_categories" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "name" varchar(100) NOT NULL,
  "code" varchar(20),
  "description" text,
  "sort_order" integer DEFAULT 0,
  "is_active" boolean DEFAULT true,
  "created_at" timestamptz DEFAULT now(),
  "updated_at" timestamptz DEFAULT now(),
  CONSTRAINT "product_categories_code_unique" UNIQUE("code")
);

-- products: add category_id and route_id; drop legacy category varchar column
ALTER TABLE "products" ADD COLUMN "category_id" uuid REFERENCES "product_categories"("id");
ALTER TABLE "products" ADD COLUMN "route_id" uuid;
ALTER TABLE "products" DROP COLUMN IF EXISTS "category";

-- work_orders: add order_qty (訂單需求數量)
ALTER TABLE "work_orders" ADD COLUMN "order_qty" integer;

-- indexes
CREATE INDEX "idx_products_category" ON "products" ("category_id");
