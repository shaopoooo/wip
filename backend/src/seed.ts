/**
 * Seed script — Phase 1 初始資料（冪等，可重複執行）
 * 使用 ref/ 目錄下的真實工廠資料
 * 執行方式：npm run seed
 */

import './utils/loadEnv'
import * as fs from 'fs'
import * as path from 'path'
import bcrypt from 'bcryptjs'
import { eq, isNull, and } from 'drizzle-orm'
import { db } from './models/db'
import {
  departments,
  productCategories,
  customers,
  vendors,
  groups,
  stations,
  equipment,
  devices,
  products,
  processRoutes,
  processSteps,
  workOrders,
  roles,
  adminUsers,
} from './models/schema'

// ── CSV parser (simple, no external dependency) ──────────────────────────────

function parseCsv(filePath: string): Record<string, string>[] {
  const raw = fs.readFileSync(filePath, 'utf-8')
  // Handle BOM
  const content = raw.replace(/^\uFEFF/, '')
  const lines = content.split('\n').filter((l) => l.trim().length > 0)
  if (lines.length < 2) return []

  const headers = parseCsvLine(lines[0]!)
  const rows: Record<string, string>[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]!)
    const row: Record<string, string> = {}
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]!] = values[j] ?? ''
    }
    rows.push(row)
  }
  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]!
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += char
      }
    } else {
      if (char === '"') {
        inQuotes = true
      } else if (char === ',') {
        result.push(current.trim())
        current = ''
      } else {
        current += char
      }
    }
  }
  result.push(current.trim())
  return result
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Docker: /ref (mounted volume), Local: ../../ref
const REF_DIR_DOCKER = '/ref/10_資料表'
const REF_DIR_LOCAL = path.resolve(__dirname, '../../ref/10_資料表')
const REF_DIR = fs.existsSync(REF_DIR_DOCKER) ? REF_DIR_DOCKER : REF_DIR_LOCAL

function readSeed(filename: string): Record<string, string>[] {
  return parseCsv(path.join(REF_DIR, '00_seed', filename))
}

function readCanonical(filename: string): Record<string, string>[] {
  return parseCsv(path.join(REF_DIR, '01_canonical', filename))
}


/** S* prefix → 軟板 category code, Y* → 軟硬結合板 category code */
function prefixToCategoryCode(prefixCode: string): string {
  return prefixCode.startsWith('Y') ? 'RFB' : 'FPC'
}

// ── Stage definitions (production flow order) ────────────────────────────────

const STAGE_DEFS: { name: string; code: string; stage: string; sortOrder: number }[] = [
  { name: '前段加工組', code: 'PRE', stage: '前段加工', sortOrder: 1 },
  { name: '鑽孔組', code: 'DRL', stage: '鑽孔/孔加工', sortOrder: 2 },
  { name: '鍍銅組', code: 'PTH', stage: '鍍銅/PTH', sortOrder: 3 },
  { name: '線路組', code: 'CIR', stage: '線路', sortOrder: 4 },
  { name: '貼合壓合組', code: 'LAM', stage: '貼合/壓合', sortOrder: 5 },
  { name: '防焊表處組', code: 'SRF', stage: '防焊/表面處理', sortOrder: 6 },
  { name: '文字印刷組', code: 'PRT', stage: '文字/印刷', sortOrder: 7 },
  { name: '成型加工組', code: 'FRM', stage: '成型加工', sortOrder: 8 },
  { name: '檢驗測試組', code: 'QC', stage: '檢驗/測試', sortOrder: 9 },
  { name: '後加工組', code: 'POST', stage: '後加工', sortOrder: 10 },
  { name: '倉庫出貨組', code: 'WH', stage: '倉庫/待出貨', sortOrder: 11 },
  { name: '未分類', code: 'OTH', stage: '未分類', sortOrder: 12 },
]

async function seed() {
  console.log('[seed] Starting...')

  // ── Roles ──────────────────────────────────────────────────────────────────
  console.log('[seed] Creating roles...')
  await db
    .insert(roles)
    .values({ name: 'super_admin', description: '超級管理員，系統最高權限' })
    .onConflictDoNothing()

  const [superAdminRole] = await db.select().from(roles).where(eq(roles.name, 'super_admin'))
  const roleId = superAdminRole?.id

  // ── Admin user ─────────────────────────────────────────────────────────────
  const adminUsername = process.env['ADMIN_INITIAL_USERNAME'] ?? 'admin'
  const adminPassword = process.env['ADMIN_INITIAL_PASSWORD'] ?? 'changeme'
  console.log(`[seed] Creating admin user: ${adminUsername}`)
  const passwordHash = await bcrypt.hash(adminPassword, 12)
  await db
    .insert(adminUsers)
    .values({ username: adminUsername, passwordHash, roleId })
    .onConflictDoNothing()

  // ── Departments ────────────────────────────────────────────────────────────
  console.log('[seed] Creating departments...')
  await db
    .insert(departments)
    .values([
      { name: '主產線', code: 'MAIN' },
    ])
    .onConflictDoNothing()

  const deptRows = await db.select().from(departments)
  const deptMain = deptRows.find((d) => d.code === 'MAIN')!

  // ── Product Categories ─────────────────────────────────────────────────────
  console.log('[seed] Creating product categories...')
  await db
    .insert(productCategories)
    .values([
      { name: '軟板（FPC）', code: 'FPC', description: 'S 線軟性電路板', sortOrder: 1 },
      { name: '軟硬結合板（RFB）', code: 'RFB', description: 'Y 線軟硬結合板', sortOrder: 2 },
    ])
    .onConflictDoNothing()

  const allCategories = await db.select().from(productCategories)
  const categoryMap = new Map(allCategories.map((c) => [c.code!, c]))

  // ── Customers ──────────────────────────────────────────────────────────────
  console.log('[seed] Creating customers...')
  const customerRows = readSeed('customer_master_seed.csv')
  if (customerRows.length > 0) {
    await db
      .insert(customers)
      .values(
        customerRows.map((r) => ({
          code: r['customer_code']!,
          costFileCount: parseInt(r['cost_file_count'] ?? '0', 10),
          needsNameMapping: r['needs_name_mapping'] === 'yes',
        })),
      )
      .onConflictDoNothing()
  }
  console.log(`[seed]   → ${customerRows.length} customers`)

  // ── Vendors ────────────────────────────────────────────────────────────────
  console.log('[seed] Creating vendors...')
  const vendorRows = readSeed('vendor_master_candidate.csv')
  if (vendorRows.length > 0) {
    await db
      .insert(vendors)
      .values(
        vendorRows.map((r) => ({
          token: r['vendor_token']!,
          normalizedName: r['normalized_vendor_guess'] ?? r['vendor_token']!,
          sourceFlags: r['source_flags'] ?? null,
          scheduleVendorCount: parseInt(r['schedule_vendor_count'] ?? '0', 10),
          shippingVendorCount: parseInt(r['shipping_vendor_count'] ?? '0', 10),
          statusTokenCount: parseInt(r['status_token_count'] ?? '0', 10),
          needsManualReview: r['needs_manual_review'] === 'yes',
        })),
      )
      .onConflictDoNothing()
  }
  console.log(`[seed]   → ${vendorRows.length} vendors`)

  // ── Groups (by stage) ─────────────────────────────────────────────────────
  console.log('[seed] Creating groups...')
  await db
    .insert(groups)
    .values(
      STAGE_DEFS.map((s) => ({
        departmentId: deptMain.id,
        name: s.name,
        code: s.code,
        stage: s.stage,
        description: `製程階段：${s.stage}`,
        sortOrder: s.sortOrder,
      })),
    )
    .onConflictDoNothing()

  const allGroups = await db.select().from(groups)

  /** Find group by department and stage */
  function findGroup(deptId: string, stage: string) {
    return allGroups.find((g) => g.departmentId === deptId && g.stage === stage)
  }

  // ── Stations (from process_dictionary_seed) ────────────────────────────────
  console.log('[seed] Creating stations...')
  const processDictRows = readSeed('process_dictionary_seed.csv')

  // Sort by observed_count descending for sort_order within each stage
  const stageCounters: Record<string, number> = {}

  const stationValues = processDictRows.map((r) => {
    const stage = r['normalized_stage_guess'] ?? '未分類'
    const group = findGroup(deptMain.id, stage)
    const stageKey = stage
    stageCounters[stageKey] = (stageCounters[stageKey] ?? 0) + 1

    return {
      departmentId: deptMain.id,
      groupId: group?.id ?? null,
      name: r['raw_process_name']!,
      code: null as string | null,
      description: `${r['process_category_guess'] ?? 'operation'}` +
        (r['default_vendor_guess'] ? `（常見委外：${r['default_vendor_guess']}）` : ''),
      sortOrder: stageCounters[stageKey]!,
    }
  })

  await db.insert(stations).values(stationValues).onConflictDoNothing()
  console.log(`[seed]   → ${processDictRows.length} stations`)

  const allStations = await db.select().from(stations)

  /** Find station by process name */
  function findStation(_deptId: string, processName: string) {
    return allStations.find((s) => s.name === processName)
  }

  // ── Equipment (1 per station) ──────────────────────────────────────────────
  console.log('[seed] Creating equipment...')
  const existingEquipment = await db.select({ stationId: equipment.stationId }).from(equipment)
  const equippedStationIds = new Set(existingEquipment.map((e) => e.stationId))

  // Use station_capacity_dictionary for equipment names where available
  const capacityRows = readCanonical('station_capacity_dictionary.csv')
  const capacityMap = new Map<string, string>()
  for (const r of capacityRows) {
    const equipName = r['primary_equipment_name']
    const stationName = r['canonical_station_name']
    if (equipName && stationName) {
      capacityMap.set(stationName, equipName)
    }
  }

  const newStations = allStations.filter((s) => !equippedStationIds.has(s.id))
  if (newStations.length > 0) {
    await db.insert(equipment).values(
      newStations.map((s) => ({
        stationId: s.id,
        name: capacityMap.get(s.name) ?? `${s.name}設備`,
        model: null as string | null,
      })),
    )
  }

  // ── Devices (2 per department) ─────────────────────────────────────────────
  console.log('[seed] Creating devices...')
  const existingDevices = await db.select({ departmentId: devices.departmentId }).from(devices)
  const seededDeptIds = new Set(existingDevices.map((d) => d.departmentId))

  if (!seededDeptIds.has(deptMain.id)) {
    const [s1, s2] = allStations
    if (s1 && s2) {
      await db.insert(devices).values([
        { departmentId: deptMain.id, stationId: s1.id, name: '平板-01', deviceType: 'tablet', userAgent: 'seed/1.0', timezone: 'Asia/Taipei' },
        { departmentId: deptMain.id, stationId: s2.id, name: '平板-02', deviceType: 'tablet', userAgent: 'seed/1.0', timezone: 'Asia/Taipei' },
      ])
    }
  }

  // ── Route Templates (4 board types) ───────────────────────────────────────
  console.log('[seed] Creating route templates...')

  const TEMPLATES: {
    name: string
    templateType: string
    description: string
    steps: string[]
  }[] = [
    {
      name: '【模板】單面板',
      templateType: 'single_sided',
      description: '單面軟板標準製程，無鑽孔/PTH',
      steps: ['裁切', '線路', 'NC', '假貼', '快壓', '化金', '文字*1', '飛針', '雷切', '成檢', '包裝'],
    },
    {
      name: '【模板】雙面板',
      templateType: 'double_sided',
      description: '雙面軟板標準製程，含 CNC + PTH',
      steps: ['裁切', 'CNC', 'PTH', '線路', '假貼', '快壓', 'LPI*1', '化金', '文字*1', '飛針', '雷切', '加工小片*2', '成檢', '包裝'],
    },
    {
      name: '【模板】多層板',
      templateType: 'multi_layer',
      description: '多層軟板標準製程，含內層線路 + 二鑽 + PLASMA',
      steps: ['裁切', '內層線路', 'NC', '假貼', '快壓', 'NC', '二鑽', 'PLASMA', 'PTH', '外層線路', '假貼', '快壓', '化金', '文字*1', '飛針', '沖制', '加工小片*2', '成檢', '包裝'],
    },
    {
      name: '【模板】軟硬結合板',
      templateType: 'rigid_flex',
      description: '軟硬結合板標準製程，含 CNC + PTH + 壓合循環',
      steps: ['裁切', 'CNC', 'PTH', '線路', '假貼', '快壓', 'LPI*1', 'NC', '化金', '文字*1', '飛針', '雷切', '刀模', '加工小片*1', '成檢', '包裝'],
    },
  ]

  for (const tpl of TEMPLATES) {
    // Upsert route (by name — idempotent)
    const existing = await db
      .select({ id: processRoutes.id })
      .from(processRoutes)
      .where(eq(processRoutes.name, tpl.name))
      .limit(1)

    let templateRouteId: string

    if (existing[0]) {
      templateRouteId = existing[0].id
    } else {
      const [created] = await db
        .insert(processRoutes)
        .values({
          departmentId: deptMain.id,
          name: tpl.name,
          description: tpl.description,
          version: 1,
          isTemplate: true,
          templateType: tpl.templateType,
        })
        .returning()
      templateRouteId = created!.id
    }

    // Skip if steps already seeded
    const existingSteps = await db
      .select({ id: processSteps.id })
      .from(processSteps)
      .where(eq(processSteps.routeId, templateRouteId))
      .limit(1)

    if (existingSteps.length > 0) continue

    const stepValues: { routeId: string; stationId: string; stepOrder: number; standardTime: null }[] = []
    for (let i = 0; i < tpl.steps.length; i++) {
      const stationName = tpl.steps[i]!
      const station = findStation(deptMain.id, stationName)
      if (!station) {
        console.warn(`[seed]   ⚠ Template station not found: ${stationName} (template: ${tpl.name})`)
        continue
      }
      stepValues.push({ routeId: templateRouteId, stationId: station.id, stepOrder: i + 1, standardTime: null })
    }

    if (stepValues.length > 0) {
      await db.insert(processSteps).values(stepValues)
      console.log(`[seed]   → ${tpl.name}: ${stepValues.length} steps`)
    }
  }

  // ── Products (from part_master_seed) ───────────────────────────────────────
  console.log('[seed] Creating products...')
  const partRows = readSeed('part_master_seed.csv')

  // Filter out composite part numbers (containing 、 or &) — they are route aliases, not real products
  const realParts = partRows.filter(
    (r) => !r['part_number']!.includes('、') && !r['part_number']!.includes('&'),
  )

  for (const r of realParts) {
    const catCode = prefixToCategoryCode(r['prefix_code'] ?? 'S')
    const cat = categoryMap.get(catCode)

    await db
      .insert(products)
      .values({
        departmentId: deptMain.id,
        name: r['part_number']!,
        modelNumber: r['part_number']!,
        description: `客戶代碼：${r['customer_code_guess'] ?? '未知'}`,
        categoryId: cat?.id ?? null,
      })
      .onConflictDoNothing()
  }
  console.log(`[seed]   → ${realParts.length} products`)

  const allProducts = await db.select().from(products)
  const productMap = new Map<string, typeof allProducts[0]>()
  for (const p of allProducts) {
    productMap.set(p.modelNumber, p)
  }

  // ── Process Routes (from route_template_seed) ──────────────────────────────
  console.log('[seed] Creating process routes...')
  const routeTemplateRows = readSeed('route_template_seed.csv')

  // Group by route_template_id
  const routeGroups = new Map<string, typeof routeTemplateRows>()
  for (const r of routeTemplateRows) {
    const templateId = r['route_template_id']!
    if (!routeGroups.has(templateId)) routeGroups.set(templateId, [])
    routeGroups.get(templateId)!.push(r)
  }

  const routeIdMap = new Map<string, string>() // route_template_id → UUID

  for (const [templateId, steps] of routeGroups) {
    const [route] = await db
      .insert(processRoutes)
      .values({
        departmentId: deptMain.id,
        name: templateId,
        description: `料號 ${templateId} 製程（${steps.length} 步驟）`,
        version: 1,
      })
      .onConflictDoNothing()
      .returning()

    if (route) {
      routeIdMap.set(templateId, route.id)
    }
  }

  // Re-query to get all routes (in case some were already created)
  const allRoutes = await db.select().from(processRoutes)
  for (const r of allRoutes) {
    if (!routeIdMap.has(r.name)) {
      routeIdMap.set(r.name, r.id)
    }
  }
  console.log(`[seed]   → ${routeGroups.size} process routes`)

  // ── Process Steps ──────────────────────────────────────────────────────────
  console.log('[seed] Creating process steps...')
  const existingSteps = await db.select({ routeId: processSteps.routeId }).from(processSteps)
  const seededRouteIds = new Set(existingSteps.map((s) => s.routeId))

  let stepCount = 0
  for (const [templateId, steps] of routeGroups) {
    const routeId = routeIdMap.get(templateId)
    if (!routeId || seededRouteIds.has(routeId)) continue

    const stepValues: {
      routeId: string
      stationId: string
      stepOrder: number
      standardTime: number | null
    }[] = []

    for (const s of steps) {
      const processName = s['raw_process_name']!
      const station = findStation(deptMain.id, processName)
      if (!station) {
        console.warn(`[seed]   ⚠ Station not found: ${processName} (route: ${templateId})`)
        continue
      }

      stepValues.push({
        routeId,
        stationId: station.id,
        stepOrder: parseInt(s['step_seq'] ?? '0', 10),
        standardTime: null,
      })
    }

    if (stepValues.length > 0) {
      await db.insert(processSteps).values(stepValues)
      stepCount += stepValues.length
    }
  }
  console.log(`[seed]   → ${stepCount} process steps`)

  // ── Link products.routeId to their routes ──────────────────────────────────
  console.log('[seed] Linking products to routes...')
  let linkedCount = 0
  for (const [templateId, routeId] of routeIdMap) {
    // Skip composite template IDs (e.g. "SA177A008A、B") — no matching product
    if (templateId.includes('、') || templateId.includes('&')) continue
    await db
      .update(products)
      .set({ routeId })
      .where(and(eq(products.modelNumber, templateId), isNull(products.routeId)))
    linkedCount++
  }
  console.log(`[seed]   → ${linkedCount} products linked to routes`)

  // ── Work Orders (from 2026.04急件 + 2026當周出貨排程) ────────────────────────
  console.log('[seed] Creating work orders...')

  // Real work order data extracted from:
  //   ref/2026.04急件.xls — urgent parts for April 2026
  //   ref/2026當周出貨排程.xls — shipping schedule (2026.3 sheet + 未出貨 + 4月)
  // Work order data with real order numbers from 出貨排程
  // Order number format: <民國年><mm><dd><流水號> e.g. 0115011202
  //   Same order number + suffix (-1, -2) = different batches under same purchase order
  const WORK_ORDER_DATA: { orderNumber: string; partNumber: string; qty: number; dueDate: string | null; status: string; priority: string; note: string }[] = [
    // ── 急件 (urgent) — from ref/2026.04急件.xls ──────────────────────────────
    { orderNumber: '0114121001-1', partNumber: 'YB267A010D', qty: 3000, dueDate: '2026-03-20', status: 'in_progress', priority: 'urgent', note: '割半斷' },
    { orderNumber: '0114121001-2', partNumber: 'YB267A010D', qty: 1450, dueDate: '2026-03-18', status: 'in_progress', priority: 'urgent', note: '功能測' },
    { orderNumber: '0114121701',   partNumber: 'YB267A010D', qty: 4000, dueDate: null, status: 'pending', priority: 'urgent', note: '暫停在刀模' },
    { orderNumber: '0115012702-2', partNumber: 'YB161A025A', qty: 1000, dueDate: '2026-03-19', status: 'in_progress', priority: 'urgent', note: '加工小片' },
    { orderNumber: '0115020902-1', partNumber: 'YB161A025A', qty: 2250, dueDate: '2026-04-02', status: 'pending', priority: 'urgent', note: '' },
    { orderNumber: '0115030902-2', partNumber: 'YB161A025A', qty: 1000, dueDate: '2026-04-14', status: 'pending', priority: 'urgent', note: '' },
    { orderNumber: '0115021108',   partNumber: 'YB267A029A', qty: 1500, dueDate: null, status: 'in_progress', priority: 'urgent', note: 'SMT 3/19~4/9' },
    { orderNumber: '0115041601',   partNumber: 'YB267A029A', qty: 70, dueDate: null, status: 'pending', priority: 'urgent', note: '待後續訂單' },
    { orderNumber: '115002-1',     partNumber: 'SB276A015A', qty: 300, dueDate: '2026-03-16', status: 'in_progress', priority: 'urgent', note: '貼膠帶' },
    { orderNumber: '115002-2',     partNumber: 'SB276A015A', qty: 700, dueDate: '2026-03-20', status: 'in_progress', priority: 'urgent', note: '貼膠帶' },
    { orderNumber: '115002-3',     partNumber: 'SB276A015A', qty: 1400, dueDate: '2026-03-24', status: 'in_progress', priority: 'urgent', note: '貼膠帶' },
    { orderNumber: '115003-1',     partNumber: 'SB276A016A', qty: 300, dueDate: '2026-03-16', status: 'in_progress', priority: 'urgent', note: '貼膠帶' },
    { orderNumber: '115003-2',     partNumber: 'SB276A016A', qty: 700, dueDate: '2026-03-20', status: 'in_progress', priority: 'urgent', note: '貼膠帶' },
    { orderNumber: '115003-3',     partNumber: 'SB276A016A', qty: 1400, dueDate: '2026-03-24', status: 'in_progress', priority: 'urgent', note: '貼膠帶' },
    { orderNumber: '115017-1',     partNumber: 'SB276A017A', qty: 170, dueDate: '2026-03-16', status: 'in_progress', priority: 'urgent', note: '倉庫' },
    { orderNumber: '115017-2',     partNumber: 'SB276A017A', qty: 2070, dueDate: null, status: 'in_progress', priority: 'urgent', note: 'SMT 3/17~3/24' },
    { orderNumber: '115017-3',     partNumber: 'SB276A017A', qty: 300, dueDate: '2026-03-18', status: 'pending', priority: 'urgent', note: '' },
    { orderNumber: '0115021203',   partNumber: 'YA276A001A', qty: 2500, dueDate: '2026-03-23', status: 'in_progress', priority: 'urgent', note: '文字' },
    { orderNumber: '0115041602',   partNumber: 'YA177A007A', qty: 1000, dueDate: '2026-04-07', status: 'completed', priority: 'urgent', note: '已出貨' },
    { orderNumber: '0115041603',   partNumber: 'YB267A029A', qty: 600, dueDate: '2026-04-10', status: 'in_progress', priority: 'urgent', note: '撕銀箔' },
    // ── 2026.3 出貨排程 — 已完成 ──────────────────────────────────────────────
    { orderNumber: '0115012810',   partNumber: 'YB267A004A', qty: 3000, dueDate: '2026-03-03', status: 'completed', priority: 'normal', note: '成檢' },
    { orderNumber: '0114122606',   partNumber: 'YC161A026B', qty: 2000, dueDate: '2026-03-06', status: 'completed', priority: 'normal', note: '包裝' },
    { orderNumber: '0115012702-1', partNumber: 'YA161A001C', qty: 5000, dueDate: '2026-03-06', status: 'completed', priority: 'normal', note: '成檢' },
    { orderNumber: '0114102204',   partNumber: 'YB280A007A', qty: 4600, dueDate: '2026-03-06', status: 'completed', priority: 'normal', note: '包裝' },
    { orderNumber: '0114121702',   partNumber: 'YB280A005A', qty: 3019, dueDate: '2026-03-06', status: 'completed', priority: 'normal', note: '成檢' },
    { orderNumber: '0114121001-3', partNumber: 'YB267A010D', qty: 2550, dueDate: '2026-03-09', status: 'completed', priority: 'normal', note: '包裝' },
    { orderNumber: '0115011904-4', partNumber: 'YB267A014A', qty: 1400, dueDate: '2026-03-10', status: 'completed', priority: 'normal', note: '包裝' },
    { orderNumber: '0115011904-3', partNumber: 'YB267A015A', qty: 1000, dueDate: '2026-03-10', status: 'completed', priority: 'normal', note: '成檢' },
    { orderNumber: '115011',       partNumber: 'SA177A008A', qty: 500, dueDate: '2026-03-09', status: 'completed', priority: 'normal', note: '包裝' },
    { orderNumber: '115012',       partNumber: 'SA177A008B', qty: 500, dueDate: '2026-03-09', status: 'completed', priority: 'normal', note: '包裝' },
    { orderNumber: '0115011204',   partNumber: 'SB267A021A', qty: 200, dueDate: '2026-03-10', status: 'completed', priority: 'normal', note: '成檢' },
    { orderNumber: '0115011904-1', partNumber: 'YB267A019A', qty: 800, dueDate: '2026-03-12', status: 'completed', priority: 'normal', note: '成檢' },
    { orderNumber: '0115011904-5', partNumber: 'YB267A015A', qty: 965, dueDate: '2026-03-12', status: 'completed', priority: 'normal', note: '成檢' },
    // ── 2026.3 出貨排程 — 進行中 ──────────────────────────────────────────────
    { orderNumber: '115015',       partNumber: 'SC280A005A', qty: 800, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '倉庫' },
    { orderNumber: '0115011205',   partNumber: 'YC280A004A', qty: 3696, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '倉庫' },
    { orderNumber: '0115012905-1', partNumber: 'YR280A001A', qty: 2545, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '倉庫' },
    { orderNumber: '115016',       partNumber: 'SB276A018A', qty: 170, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '倉庫' },
    { orderNumber: '115001',       partNumber: 'SD275A006A', qty: 100, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '成檢' },
    { orderNumber: '0115030201-1', partNumber: 'YA283A001A', qty: 1000, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '包裝' },
    { orderNumber: '0115030201-2', partNumber: 'YA283A002A', qty: 1300, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '包裝' },
    { orderNumber: '0115030201-3', partNumber: 'YA283A003A', qty: 500, dueDate: '2026-03-16', status: 'in_progress', priority: 'normal', note: '成檢' },
    { orderNumber: '0115012202',   partNumber: 'YR237A001A', qty: 5004, dueDate: '2026-03-17', status: 'in_progress', priority: 'normal', note: '測試' },
    { orderNumber: '115013',       partNumber: 'SB165A012C', qty: 110, dueDate: '2026-03-18', status: 'in_progress', priority: 'normal', note: '加工小片' },
    { orderNumber: '115018',       partNumber: 'SB267A019A', qty: 3000, dueDate: '2026-03-19', status: 'in_progress', priority: 'normal', note: '譽景泰外發' },
    { orderNumber: '115020',       partNumber: 'SB267A033A', qty: 1000, dueDate: '2026-03-19', status: 'in_progress', priority: 'normal', note: '譽景泰外發' },
    { orderNumber: '0114121214',   partNumber: 'YC280A002A', qty: 2500, dueDate: '2026-03-20', status: 'in_progress', priority: 'normal', note: '刀模' },
    { orderNumber: '0114121201-04',partNumber: 'YD082A009A', qty: 100, dueDate: '2026-03-20', status: 'in_progress', priority: 'normal', note: '線路' },
    { orderNumber: '0114120903',   partNumber: 'SB267A009A', qty: 15, dueDate: '2026-03-20', status: 'in_progress', priority: 'normal', note: '盲修' },
    { orderNumber: '0115020302',   partNumber: 'YB237A002A', qty: 920, dueDate: '2026-03-23', status: 'in_progress', priority: 'normal', note: '假貼補強' },
    { orderNumber: '0114100904',   partNumber: 'YB267A013A', qty: 1000, dueDate: '2026-03-26', status: 'in_progress', priority: 'normal', note: '包裝' },
    { orderNumber: '0115020902-2', partNumber: 'YC161A026B', qty: 2000, dueDate: '2026-03-27', status: 'in_progress', priority: 'normal', note: '譽景泰外發' },
    { orderNumber: '0115012704',   partNumber: 'YB267A003B', qty: 2000, dueDate: '2026-03-31', status: 'in_progress', priority: 'normal', note: '檢大張' },
    { orderNumber: '0115012001-1', partNumber: 'YD267A026A', qty: 1470, dueDate: null, status: 'in_progress', priority: 'normal', note: '檢大張' },
    { orderNumber: '0115012001-2', partNumber: 'YD267A026A', qty: 400, dueDate: null, status: 'in_progress', priority: 'normal', note: '刀模' },
    { orderNumber: '0115012812',   partNumber: 'YA220X001A', qty: 4000, dueDate: '2026-04-06', status: 'in_progress', priority: 'normal', note: '鑽孔' },
    { orderNumber: '0115022301-1', partNumber: 'YR237A001A', qty: 5004, dueDate: '2026-04-10', status: 'in_progress', priority: 'normal', note: '棕化' },
    { orderNumber: '0115020301-1', partNumber: 'YB267A018A', qty: 600, dueDate: '2026-03-10', status: 'in_progress', priority: 'normal', note: '包裝' },
    { orderNumber: '0115020301-2', partNumber: 'YB267A017A', qty: 600, dueDate: '2026-03-10', status: 'in_progress', priority: 'normal', note: 'OQC' },
    // ── 待出貨 / 遠期 ────────────────────────────────────────────────────────
    { orderNumber: '0115012905-2', partNumber: 'YR280A001A', qty: 2455, dueDate: '2026-04-21', status: 'pending', priority: 'normal', note: '待硬板製作' },
    { orderNumber: '0115012905-3', partNumber: 'YR280A001A', qty: 5000, dueDate: '2026-05-04', status: 'pending', priority: 'normal', note: '待硬板製作' },
    { orderNumber: '0115030902-1', partNumber: 'YA161A016B', qty: 2000, dueDate: '2026-05-11', status: 'pending', priority: 'normal', note: '' },
    { orderNumber: '0115022301-2', partNumber: 'YR237A001A', qty: 6201, dueDate: '2026-06-10', status: 'in_progress', priority: 'normal', note: '棕化' },
    { orderNumber: '0115030204',   partNumber: 'YB196A011A', qty: 3000, dueDate: null, status: 'pending', priority: 'normal', note: '譽景泰外發' },
    { orderNumber: '0115041604',   partNumber: 'SC196A105A', qty: 3000, dueDate: null, status: 'pending', priority: 'normal', note: '譽景泰外發' },
    { orderNumber: '0115041605',   partNumber: 'YB196A005B', qty: 35, dueDate: null, status: 'pending', priority: 'normal', note: '待SMT' },
    { orderNumber: '0115041606',   partNumber: 'YA283P001A', qty: 3883, dueDate: null, status: 'pending', priority: 'normal', note: 'CNC-客戶暫停' },
    { orderNumber: '0115041607',   partNumber: 'YA283P002A', qty: 4395, dueDate: null, status: 'pending', priority: 'normal', note: 'CNC-客戶暫停' },
    { orderNumber: '0115041608',   partNumber: 'YA283P003A', qty: 3383, dueDate: null, status: 'pending', priority: 'normal', note: 'CNC-客戶暫停' },
    { orderNumber: '115019',       partNumber: 'SB185A025A', qty: 150, dueDate: null, status: 'in_progress', priority: 'normal', note: '檢大張' },
  ]

  let woCreated = 0

  for (const wo of WORK_ORDER_DATA) {
    const product = productMap.get(wo.partNumber)
    if (!product) {
      console.warn(`[seed]   ⚠ Product not found for WO: ${wo.partNumber}`)
      continue
    }

    // Find a matching route for this product (exact match, then composite)
    let finalRouteId = routeIdMap.get(wo.partNumber)
    if (!finalRouteId) {
      for (const [tid, rid] of routeIdMap) {
        if (tid.includes(wo.partNumber) || wo.partNumber.includes(tid)) {
          finalRouteId = rid
          break
        }
      }
    }

    if (!finalRouteId) {
      // Use product.routeId as fallback
      finalRouteId = product.routeId ?? undefined
    }

    if (!finalRouteId) {
      console.warn(`[seed]   ⚠ No route for WO: ${wo.partNumber}, skipping`)
      continue
    }

    await db
      .insert(workOrders)
      .values({
        departmentId: product.departmentId,
        orderNumber: wo.orderNumber,
        productId: product.id,
        routeId: finalRouteId,
        plannedQty: wo.qty,
        status: wo.status,
        priority: wo.priority,
        dueDate: wo.dueDate,
        note: wo.note || null,
      })
      .onConflictDoNothing()

    woCreated++
  }
  console.log(`[seed]   → ${woCreated} work orders (${WORK_ORDER_DATA.filter(w => w.priority === 'urgent').length} urgent)`)

  console.log('[seed] Done ✓')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] Failed:', err)
  process.exit(1)
})
