/**
 * Seed script — Phase 1 初始資料（冪等，可重複執行）
 * 執行方式：npm run seed
 */

import './utils/loadEnv'
import bcrypt from 'bcryptjs'
import { eq, and } from 'drizzle-orm'
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
      { name: 'FPC軟板', code: 'FPC' },
      { name: '植物工廠', code: 'VEG' },
    ])
    .onConflictDoNothing()

  const deptRows = await db.select().from(departments)
  const deptA = deptRows.find((d) => d.code === 'FPC')!
  const deptB = deptRows.find((d) => d.code === 'VEG')!

  // ── Groups (3 per department) ──────────────────────────────────────────────
  console.log('[seed] Creating groups...')
  const groupDefs = [
    { name: 'SMT 組', code: 'SMT', sortOrder: 1 },
    { name: '插件組', code: 'THT', sortOrder: 2 },
    { name: '測試組', code: 'TST', sortOrder: 3 },
  ]

  for (const dept of [deptA, deptB]) {
    await db
      .insert(groups)
      .values(groupDefs.map((g) => ({ ...g, departmentId: dept.id })))
      .onConflictDoNothing()
  }

  const allGroups = await db.select().from(groups)
  const groupsA = allGroups.filter((g) => g.departmentId === deptA.id)
  const groupsB = allGroups.filter((g) => g.departmentId === deptB.id)
  const findGroup = (rows: typeof groupsA, code: string) => rows.find((g) => g.code === code)!

  // ── Stations (6 per department, 2 per group) ───────────────────────────────
  console.log('[seed] Creating stations...')
  const stationDefs = [
    { name: '鋼版印刷站', code: 'SMT-01', groupCode: 'SMT', sortOrder: 1 },
    { name: 'SPI 檢測站', code: 'SMT-02', groupCode: 'SMT', sortOrder: 2 },
    { name: '插件站',     code: 'THT-01', groupCode: 'THT', sortOrder: 3 },
    { name: '波焊爐站',   code: 'THT-02', groupCode: 'THT', sortOrder: 4 },
    { name: 'ICT 站',    code: 'TST-01', groupCode: 'TST', sortOrder: 5 },
    { name: 'FCT 站',    code: 'TST-02', groupCode: 'TST', sortOrder: 6 },
  ]

  for (const [dept, groupRows] of [[deptA, groupsA], [deptB, groupsB]] as const) {
    await db
      .insert(stations)
      .values(stationDefs.map((s) => ({
        name: s.name,
        code: s.code,
        sortOrder: s.sortOrder,
        departmentId: dept.id,
        groupId: findGroup(groupRows, s.groupCode).id,
      })))
      .onConflictDoNothing()
  }

  const allStations = await db.select().from(stations)
  const stationsA = allStations.filter((s) => s.departmentId === deptA.id)
  const stationsB = allStations.filter((s) => s.departmentId === deptB.id)

  // ── Equipment (1 per station) ──────────────────────────────────────────────
  console.log('[seed] Creating equipment...')
  const existingEquipment = await db.select({ stationId: equipment.stationId }).from(equipment)
  const equippedStationIds = new Set(existingEquipment.map((e) => e.stationId))

  for (const stationRows of [stationsA, stationsB]) {
    const newStations = stationRows.filter((s) => !equippedStationIds.has(s.id))
    if (newStations.length > 0) {
      await db.insert(equipment).values(
        newStations.map((s) => ({ stationId: s.id, name: `${s.name}設備`, model: 'Generic-001' }))
      )
    }
  }

  // ── Devices (2 per department) ─────────────────────────────────────────────
  console.log('[seed] Creating devices...')
  const existingDevices = await db.select({ departmentId: devices.departmentId }).from(devices)
  const seededDeptIds = new Set(existingDevices.map((d) => d.departmentId))

  for (const [dept, stationRows] of [[deptA, stationsA], [deptB, stationsB]] as const) {
    if (seededDeptIds.has(dept.id)) continue
    const [s1, s2] = stationRows
    await db.insert(devices).values([
      { departmentId: dept.id, stationId: s1!.id, name: '平板-01', deviceType: 'tablet', userAgent: 'seed/1.0', timezone: 'Asia/Taipei' },
      { departmentId: dept.id, stationId: s2!.id, name: '平板-02', deviceType: 'tablet', userAgent: 'seed/1.0', timezone: 'Asia/Taipei' },
    ])
  }

  // ── Products ───────────────────────────────────────────────────────────────
  console.log('[seed] Creating products...')
  await db
    .insert(products)
    .values([
      { departmentId: deptA.id, name: '控制板 PCB A 型', modelNumber: 'PCB-A-001', description: 'Phase 1 驗收用產品' },
      { departmentId: deptB.id, name: '控制板 PCB B 型', modelNumber: 'PCB-B-001', description: 'Phase 1 驗收用產品' },
    ])
    .onConflictDoNothing()

  const allProducts = await db.select().from(products)
  const productA = allProducts.find((p) => p.departmentId === deptA.id)!
  const productB = allProducts.find((p) => p.departmentId === deptB.id)!

  // ── Process Routes ─────────────────────────────────────────────────────────
  console.log('[seed] Creating process routes...')
  await db
    .insert(processRoutes)
    .values([
      { departmentId: deptA.id, name: '標準工序路由 A', description: '6 站固定線性路由', version: 1 },
      { departmentId: deptB.id, name: '標準工序路由 B', description: '6 站固定線性路由', version: 1 },
    ])
    .onConflictDoNothing()

  const allRoutes = await db.select().from(processRoutes)
  const routeA = allRoutes.find((r) => r.departmentId === deptA.id)!
  const routeB = allRoutes.find((r) => r.departmentId === deptB.id)!

  // ── Process Steps ──────────────────────────────────────────────────────────
  console.log('[seed] Creating process steps...')
  const existingSteps = await db.select({ routeId: processSteps.routeId }).from(processSteps)
  const seededRouteIds = new Set(existingSteps.map((s) => s.routeId))

  for (const [route, stationRows] of [[routeA, stationsA], [routeB, stationsB]] as const) {
    if (seededRouteIds.has(route.id)) continue
    await db.insert(processSteps).values(
      stationRows.map((s, i) => ({ routeId: route.id, stationId: s.id, stepOrder: i + 1, standardTime: 300 }))
    )
  }

  // ── Work Orders ────────────────────────────────────────────────────────────
  console.log('[seed] Creating work orders...')
  const year = new Date().getFullYear()
  await db
    .insert(workOrders)
    .values([
      { departmentId: deptA.id, orderNumber: `WO-FPC-${year}-001`, productId: productA.id, routeId: routeA.id, plannedQty: 1000, status: 'pending', priority: 'normal' },
      { departmentId: deptB.id, orderNumber: `WO-VEG-${year}-001`, productId: productB.id, routeId: routeB.id, plannedQty: 500,  status: 'pending', priority: 'normal' },
    ])
    .onConflictDoNothing()

  console.log('[seed] Done ✓')
  process.exit(0)
}

seed().catch((err) => {
  console.error('[seed] Failed:', err)
  process.exit(1)
})
