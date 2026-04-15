import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  date,
  numeric,
  inet,
  unique,
  uniqueIndex,
  check,
  index,
  foreignKey,
} from 'drizzle-orm/pg-core'
import { sql } from 'drizzle-orm'

// ── departments ───────────────────────────────────────────────────────────────
export const departments = pgTable('departments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 10 }).notNull().unique(), // 'A' | 'B'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── product_categories ───────────────────────────────────────────────────────
export const productCategories = pgTable('product_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  code: varchar('code', { length: 20 }).unique(),
  description: text('description'),
  sortOrder: integer('sort_order').default(0),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── customers ─────────────────────────────────────────────────────────────────
export const customers = pgTable('customers', {
  id: uuid('id').primaryKey().defaultRandom(),
  code: varchar('code', { length: 20 }).notNull().unique(),        // 客戶代碼 '022', '161' etc.
  name: varchar('name', { length: 200 }),                           // NULL until name mapping done
  costFileCount: integer('cost_file_count').default(0),
  needsNameMapping: boolean('needs_name_mapping').default(true),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
})

// ── vendors ───────────────────────────────────────────────────────────────────
export const vendors = pgTable(
  'vendors',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: varchar('token', { length: 100 }).notNull().unique(),     // raw vendor_token
    normalizedName: varchar('normalized_name', { length: 200 }).notNull(), // 正規化廠商名稱
    sourceFlags: varchar('source_flags', { length: 200 }),           // 'schedule_vendor,shipping_vendor'
    scheduleVendorCount: integer('schedule_vendor_count').default(0),
    shippingVendorCount: integer('shipping_vendor_count').default(0),
    statusTokenCount: integer('status_token_count').default(0),
    needsManualReview: boolean('needs_manual_review').default(false),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_vendors_normalized').on(t.normalizedName),
  ],
)

// ── groups ────────────────────────────────────────────────────────────────────
export const groups = pgTable(
  'groups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 20 }),
    stage: varchar('stage', { length: 50 }),  // normalized_stage_guess: '前段加工', '貼合/壓合', etc.
    description: text('description'),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('uq_groups_dept_name').on(t.departmentId, t.name),
    unique('uq_groups_dept_code').on(t.departmentId, t.code),
    index('idx_groups_dept').on(t.departmentId),
  ],
)

// ── products ──────────────────────────────────────────────────────────────────
export const products = pgTable(
  'products',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    name: varchar('name', { length: 200 }).notNull(),
    modelNumber: varchar('model_number', { length: 50 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    categoryId: uuid('category_id').references(() => productCategories.id),  // 產品種類
    routeId: uuid('route_id'),  // 1:1 product-to-route (FK defined via foreignKey helper to avoid circular)
    bomVersion: varchar('bom_version', { length: 20 }),     // Phase 2
    unitCost: numeric('unit_cost', { precision: 12, scale: 2 }), // Phase 3
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('uq_products_dept_model').on(t.departmentId, t.modelNumber),
    index('idx_products_dept').on(t.departmentId),
    index('idx_products_category').on(t.categoryId),
  ],
)

// ── stations (defined before process_routes because process_steps references it) ──
export const stations = pgTable(
  'stations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    groupId: uuid('group_id').references(() => groups.id), // Phase 1: nullable; Phase 2: NOT NULL
    name: varchar('name', { length: 100 }).notNull(),
    code: varchar('code', { length: 20 }),
    description: text('description'),
    sortOrder: integer('sort_order').default(0),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('uq_stations_dept_name').on(t.departmentId, t.name),
    unique('uq_stations_dept_code').on(t.departmentId, t.code),
    index('idx_stations_dept').on(t.departmentId),
    index('idx_stations_group').on(t.groupId),
  ],
)

// ── process_routes ────────────────────────────────────────────────────────────
export const processRoutes = pgTable(
  'process_routes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    isActive: boolean('is_active').default(true),
    version: integer('version').default(1),
    isTemplate: boolean('is_template').default(false).notNull(),
    templateType: varchar('template_type', { length: 50 }), // 'single_sided' | 'double_sided' | 'multi_layer' | 'rigid_flex'
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('uq_routes_dept_name_ver').on(t.departmentId, t.name, t.version),
    index('idx_routes_dept').on(t.departmentId),
  ],
)

// ── process_steps ─────────────────────────────────────────────────────────────
export const processSteps = pgTable('process_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  routeId: uuid('route_id')
    .notNull()
    .references(() => processRoutes.id),
  stationId: uuid('station_id')
    .notNull()
    .references(() => stations.id),
  stepOrder: integer('step_order').notNull(),
  isOptional: boolean('is_optional').default(false),  // Phase 2
  conditionExpr: jsonb('condition_expr'),              // Phase 2+
  standardTime: integer('standard_time'),              // seconds
  nextStepId: uuid('next_step_id'),                   // self-ref (not enforced by FK to avoid circular)
  reworkStepId: uuid('rework_step_id'),               // Phase 2+
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── equipment ─────────────────────────────────────────────────────────────────
export const equipment = pgTable(
  'equipment',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id),
    name: varchar('name', { length: 100 }).notNull(),
    model: varchar('model', { length: 100 }),
    serialNumber: varchar('serial_number', { length: 100 }),
    isActive: boolean('is_active').default(true),
    notes: text('notes'),                     // 備註
    calibrationDue: date('calibration_due'),  // Phase 2
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_equipment_station').on(t.stationId),
  ],
)

// ── devices ───────────────────────────────────────────────────────────────────
export const devices = pgTable(
  'devices',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    stationId: uuid('station_id').references(() => stations.id), // optional default station
    name: varchar('name', { length: 100 }),       // optional nickname
    deviceType: varchar('device_type', { length: 20 }).notNull(), // tablet | phone | scanner
    userAgent: text('user_agent'),
    screenInfo: jsonb('screen_info'),              // {width, height, colorDepth}
    timezone: varchar('timezone', { length: 50 }),
    webglRenderer: varchar('webgl_renderer', { length: 200 }),
    ipAddress: inet('ip_address'),
    employeeId: varchar('employee_id', { length: 50 }), // optional
    isActive: boolean('is_active').default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_devices_station').on(t.stationId),
  ],
)

// ── work_orders ───────────────────────────────────────────────────────────────
export const workOrders = pgTable(
  'work_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    departmentId: uuid('department_id')
      .notNull()
      .references(() => departments.id),
    orderNumber: varchar('order_number', { length: 50 }).notNull(),
    // format: 0<民國年><mm><dd><seq> e.g. 0115012810 / 0115012810-A (child) / 0115012810-A1 (grandchild)
    productId: uuid('product_id')
      .notNull()
      .references(() => products.id),
    routeId: uuid('route_id')
      .references(() => processRoutes.id),
    plannedQty: integer('planned_qty').notNull(),   // 製作數量
    orderQty: integer('order_qty'),                  // 訂單需求數量
    status: varchar('status', { length: 20 }).notNull(),
    // pending | in_progress | completed | cancelled | split
    priority: varchar('priority', { length: 10 }).default('normal'), // normal | urgent
    dueDate: date('due_date'),
    parentWorkOrderId: uuid('parent_work_order_id'),  // self-ref FK defined below
    splitReason: varchar('split_reason', { length: 20 }), // rush | batch_shipment
    isSplit: boolean('is_split').default(false),
    note: text('note'),                         // 備註
    salesOrderId: uuid('sales_order_id'),    // Phase 3
    scheduledStart: timestamp('scheduled_start', { withTimezone: true }), // Phase 3
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    check('chk_positive_qty', sql`${t.plannedQty} > 0`),
    // self-referential FK via foreignKey helper (avoids TypeScript circular type issue)
    foreignKey({ columns: [t.parentWorkOrderId], foreignColumns: [t.id] }),
    index('idx_work_orders_parent').on(t.parentWorkOrderId),
    uniqueIndex('uq_work_orders_order_product').on(t.orderNumber, t.productId),
    index('idx_work_orders_status').on(t.status),
    index('idx_work_orders_dept').on(t.departmentId),
  ],
)

// ── split_logs ────────────────────────────────────────────────────────────────
export const splitLogs = pgTable('split_logs', {
  id: uuid('id').primaryKey().defaultRandom(),
  parentWorkOrderId: uuid('parent_work_order_id')
    .notNull()
    .references(() => workOrders.id),
  childWorkOrderIds: uuid('child_work_order_ids').array().notNull(),
  splitReason: varchar('split_reason', { length: 20 }).notNull(), // rush | batch_shipment
  splitNote: text('split_note'),
  qtyBeforeSplit: integer('qty_before_split').notNull(),
  qtyDistribution: jsonb('qty_distribution').notNull(), // {"WO-...-A": 200, "WO-...-B": 800}
  deviceId: uuid('device_id').references(() => devices.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── station_logs ──────────────────────────────────────────────────────────────
export const stationLogs = pgTable(
  'station_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workOrderId: uuid('work_order_id')
      .notNull()
      .references(() => workOrders.id),
    stationId: uuid('station_id')
      .notNull()
      .references(() => stations.id),
    equipmentId: uuid('equipment_id').references(() => equipment.id),
    deviceId: uuid('device_id')
      .notNull()
      .references(() => devices.id),
    operatorId: uuid('operator_id'),           // Phase 1: NULL; Phase 2: FK to operators
    stepId: uuid('step_id')
      .notNull()
      .references(() => processSteps.id),
    checkInTime: timestamp('check_in_time', { withTimezone: true }).notNull(),
    checkOutTime: timestamp('check_out_time', { withTimezone: true }),  // NULL until check-out
    actualQtyIn: integer('actual_qty_in'),
    actualQtyOut: integer('actual_qty_out'),   // = actual_qty_in - defect_qty
    defectQty: integer('defect_qty').default(0),
    status: varchar('status', { length: 20 }).notNull(),
    // in_progress | completed | abnormal | auto_filled
    machineParams: jsonb('machine_params'),
    serialNumber: varchar('serial_number', { length: 100 }),  // Phase 2
    parentLogId: uuid('parent_log_id'),                       // Phase 2
    materialBatchIds: jsonb('material_batch_ids'),             // Phase 2
    previousLogId: uuid('previous_log_id'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    unique('uq_station_logs_wo_station_checkin').on(t.workOrderId, t.stationId, t.checkInTime),
    index('idx_station_logs_wo').on(t.workOrderId),
    index('idx_station_logs_station').on(t.stationId),
    index('idx_station_logs_time').on(t.checkInTime),
    index('idx_station_logs_device').on(t.deviceId),
  ],
)

// ── defect_records ────────────────────────────────────────────────────────────
export const defectRecords = pgTable(
  'defect_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    stationLogId: uuid('station_log_id')
      .notNull()
      .references(() => stationLogs.id),
    defectType: varchar('defect_type', { length: 50 }).notNull(),
    defectName: varchar('defect_name', { length: 200 }).notNull(),
    qty: integer('qty').notNull().default(1),
    severity: varchar('severity', { length: 10 }).default('minor'), // minor | major | critical
    disposition: varchar('disposition', { length: 20 }),            // rework | scrap | accept
    note: text('note'),
    imageUrl: varchar('image_url', { length: 500 }),  // Phase 2
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_defects_log').on(t.stationLogId),
  ],
)

// ── audit_logs (immutable — INSERT only) ──────────────────────────────────────
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    entityId: uuid('entity_id').notNull(),
    action: varchar('action', { length: 20 }).notNull(),
    // create | update | delete | check_in | check_out | split | time_correction
    changes: jsonb('changes'),       // {"field": {"old": "...", "new": "..."}}
    deviceId: uuid('device_id').references(() => devices.id),
    operatorId: uuid('operator_id'), // Phase 2
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (t) => [
    index('idx_audit_entity').on(t.entityType, t.entityId),
    index('idx_audit_time').on(t.createdAt),
  ],
)

// ── device_tokens ─────────────────────────────────────────────────────────────
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: varchar('token', { length: 20 }).notNull().unique(),  // e.g. "A3BK9ZX2"
    isUsed: boolean('is_used').default(false).notNull(),
    deviceId: uuid('device_id').references(() => devices.id),   // NULL until consumed
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    usedAt: timestamp('used_at', { withTimezone: true }),
  },
  (t) => [
    index('idx_device_tokens_token').on(t.token),
    index('idx_device_tokens_used').on(t.isUsed),
  ],
)

// ── roles ─────────────────────────────────────────────────────────────────────
export const roles = pgTable('roles', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 50 }).notNull().unique(),
  description: text('description'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})

// ── admin_users ───────────────────────────────────────────────────────────────
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  roleId: uuid('role_id').references(() => roles.id),
  isActive: boolean('is_active').default(true),
  externalId: varchar('external_id', { length: 255 }), // Phase 2: Authentik sub
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
})
