/**
 * Seed script — Phase 1 初始資料
 * 執行方式：npm run seed
 *
 * 產生資料：
 *   - 2 個部門（A 線 / B 線）
 *   - 各 3 個組別（SMT 組 / 插件組 / 測試組）
 *   - 各 6 個站點（每組 2 站）
 *   - 各 2 台 devices（綁定站點）
 *   - 1 個產品 + 1 個路由（6 步驟，固定線性）× 每個部門
 *   - 各 1 張工單（status: pending）
 *   - 1 個 super_admin 角色 + 1 個管理員帳號（從 .env 讀取）
 */

import './utils/loadEnv'
import bcrypt from 'bcryptjs'
import { db } from './models/db'
import {
  departments,
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

async function seed() {
  console.log('[seed] Starting...')

  // ── Roles ──────────────────────────────────────────────────────────────────
  console.log('[seed] Creating roles...')
  const [superAdminRole] = await db
    .insert(roles)
    .values({ name: 'super_admin', description: '超級管理員，系統最高權限' })
    .onConflictDoNothing()
    .returning()

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
  const deptRows = await db
    .insert(departments)
    .values([
      { name: 'A 線', code: 'A' },
      { name: 'B 線', code: 'B' },
    ])
    .onConflictDoNothing()
    .returning()

  if (deptRows.length === 0) {
    console.log('[seed] Departments already exist, skipping remaining seed.')
    process.exit(0)
  }

  const deptA = deptRows.find((d) => d.code === 'A')!
  const deptB = deptRows.find((d) => d.code === 'B')!

  // ── Groups (3 per department) ──────────────────────────────────────────────
  console.log('[seed] Creating groups...')
  const groupDefs = [
    { name: 'SMT 組', code: 'SMT', sortOrder: 1 },
    { name: '插件組', code: 'THT', sortOrder: 2 },
    { name: '測試組', code: 'TST', sortOrder: 3 },
  ]

  const groupRowsA = await db
    .insert(groups)
    .values(groupDefs.map((g) => ({ ...g, departmentId: deptA.id })))
    .returning()

  const groupRowsB = await db
    .insert(groups)
    .values(groupDefs.map((g) => ({ ...g, departmentId: deptB.id })))
    .returning()

  const findGroup = (rows: typeof groupRowsA, code: string) =>
    rows.find((g) => g.code === code)!

  // ── Stations (6 per department, 2 per group) ───────────────────────────────
  console.log('[seed] Creating stations...')
  const stationDefs = [
    // SMT 組
    { name: '鋼版印刷站', code: 'SMT-01', groupCode: 'SMT', sortOrder: 1 },
    { name: 'SPI 檢測站', code: 'SMT-02', groupCode: 'SMT', sortOrder: 2 },
    // 插件組
    { name: '插件站',   code: 'THT-01', groupCode: 'THT', sortOrder: 3 },
    { name: '波焊爐站', code: 'THT-02', groupCode: 'THT', sortOrder: 4 },
    // 測試組
    { name: 'ICT 站',   code: 'TST-01', groupCode: 'TST', sortOrder: 5 },
    { name: 'FCT 站',   code: 'TST-02', groupCode: 'TST', sortOrder: 6 },
  ]

  async function createStations(deptId: string, groupRows: typeof groupRowsA) {
    const values = stationDefs.map((s) => ({
      name: s.name,
      code: s.code,
      sortOrder: s.sortOrder,
      departmentId: deptId,
      groupId: findGroup(groupRows, s.groupCode).id,
    }))
    return db.insert(stations).values(values).returning()
  }

  const stationsA = await createStations(deptA.id, groupRowsA)
  const stationsB = await createStations(deptB.id, groupRowsB)

  // ── Equipment (1 per station for seed purposes) ────────────────────────────
  console.log('[seed] Creating equipment...')
  async function createEquipment(stationRows: typeof stationsA) {
    const values = stationRows.map((s) => ({
      stationId: s.id,
      name: `${s.name}設備`,
      model: 'Generic-001',
    }))
    return db.insert(equipment).values(values).returning()
  }

  await createEquipment(stationsA)
  await createEquipment(stationsB)

  // ── Devices (2 per department, bound to first 2 stations) ─────────────────
  console.log('[seed] Creating devices...')
  async function createDevices(stationRows: typeof stationsA) {
    const [s1, s2] = stationRows
    return db
      .insert(devices)
      .values([
        {
          stationId: s1!.id,
          name: '平板-01',
          deviceType: 'tablet',
          userAgent: 'seed/1.0',
          timezone: 'Asia/Taipei',
        },
        {
          stationId: s2!.id,
          name: '平板-02',
          deviceType: 'tablet',
          userAgent: 'seed/1.0',
          timezone: 'Asia/Taipei',
        },
      ])
      .returning()
  }

  await createDevices(stationsA)
  await createDevices(stationsB)

  // ── Products ───────────────────────────────────────────────────────────────
  console.log('[seed] Creating products...')
  async function createProduct(deptId: string, suffix: string) {
    const [row] = await db
      .insert(products)
      .values({
        departmentId: deptId,
        name: `控制板 PCB ${suffix} 型`,
        modelNumber: `PCB-${suffix}-001`,
        description: '電子組裝主控板，Phase 1 驗收用產品',
      })
      .returning()
    return row!
  }

  const productA = await createProduct(deptA.id, 'A')
  const productB = await createProduct(deptB.id, 'B')

  // ── Process Routes ─────────────────────────────────────────────────────────
  console.log('[seed] Creating process routes...')
  async function createRoute(deptId: string, suffix: string) {
    const [row] = await db
      .insert(processRoutes)
      .values({
        departmentId: deptId,
        name: `標準工序路由 ${suffix}`,
        description: '6 站固定線性路由，Phase 1 驗收用',
        version: 1,
      })
      .returning()
    return row!
  }

  const routeA = await createRoute(deptA.id, 'A')
  const routeB = await createRoute(deptB.id, 'B')

  // ── Process Steps (6 steps per route, linear) ──────────────────────────────
  console.log('[seed] Creating process steps...')
  async function createSteps(routeId: string, stationRows: typeof stationsA) {
    const values = stationRows.map((s, i) => ({
      routeId,
      stationId: s.id,
      stepOrder: i + 1,
      standardTime: 300, // 5 minutes per station (placeholder)
    }))
    return db.insert(processSteps).values(values).returning()
  }

  await createSteps(routeA.id, stationsA)
  await createSteps(routeB.id, stationsB)

  // ── Work Orders ────────────────────────────────────────────────────────────
  console.log('[seed] Creating work orders...')
  const year = new Date().getFullYear()

  await db.insert(workOrders).values([
    {
      departmentId: deptA.id,
      orderNumber: `WO-A-${year}-001`,
      productId: productA.id,
      routeId: routeA.id,
      plannedQty: 1000,
      status: 'pending',
      priority: 'normal',
    },
    {
      departmentId: deptB.id,
      orderNumber: `WO-B-${year}-001`,
      productId: productB.id,
      routeId: routeB.id,
      plannedQty: 500,
      status: 'pending',
      priority: 'normal',
    },
  ])

  console.log('[seed] Done ✓')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] Failed:', err)
  process.exit(1)
})
