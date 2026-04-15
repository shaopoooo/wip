-- Drop the old single-column unique constraint on order_number
ALTER TABLE "work_orders" DROP CONSTRAINT IF EXISTS "work_orders_order_number_unique";

-- Add composite unique index (order_number + product_id)
CREATE UNIQUE INDEX IF NOT EXISTS "uq_work_orders_order_product" ON "work_orders" ("order_number", "product_id");
