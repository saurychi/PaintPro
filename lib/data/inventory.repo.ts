import { fakeDelay, toMs } from "./_shared"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ItemCategory = "Materials" | "Equipment"

export type StockStatus = "In Stock" | "Low Stock" | "Out of Stock"

/** A material inventory item (paint, tape, sandpaper, etc.) */
export type InventoryMaterial = {
  id: string
  name: string
  unitType: string        // "Can" | "Roll" | "Sheet" | "Bottle" | "Piece" | "Tube"
  unitCost: number        // AU$
  inStock: number
  supplier: string
  location: string        // e.g. "Storage Shed A"
  dateCreated: string     // ISO date string, e.g. "2024-01-10"
  lastUpdated: string     // ISO date string
  category: "Materials"
}

/** A piece of equipment (spray gun, ladder, compressor, etc.) */
export type InventoryEquipment = {
  id: string
  name: string
  serialNumber: string
  condition: "Good" | "Fair" | "Poor" | "Under Repair"
  assignedTo: string | null  // staff member name, or null if unassigned
  location: string
  purchaseDate: string        // ISO date string
  lastServiced: string        // ISO date string
  category: "Equipment"
}

export type InventoryItem = InventoryMaterial | InventoryEquipment

export type ListInventoryParams = {
  category?: ItemCategory
  query?: string
  supplier?: string
  location?: string
  limit?: number
}

export type SortKey = "name_asc" | "name_desc" | "date_desc" | "date_asc"

// ---------------------------------------------------------------------------
// Dummy Data
// (Later: replace function bodies with Supabase queries)
// ---------------------------------------------------------------------------

const DUMMY_MATERIALS: InventoryMaterial[] = [
  { id: "001", name: "White Latex Primer (1L)",    unitType: "Can",    unitCost: 32.00, inStock: 8,  supplier: "JewLuxe",     location: "Storage Shed A", dateCreated: "2024-01-10", lastUpdated: "2024-02-15", category: "Materials" },
  { id: "002", name: "White Latex Primer (1L)",    unitType: "Can",    unitCost: 32.00, inStock: 8,  supplier: "JewLuxe",     location: "Storage Shed A", dateCreated: "2024-01-10", lastUpdated: "2024-02-15", category: "Materials" },
  { id: "003", name: "Satin Wall Paint (4L)",      unitType: "Can",    unitCost: 98.00, inStock: 5,  supplier: "JewLuxe",     location: "Storage Shed A", dateCreated: "2024-01-12", lastUpdated: "2024-02-18", category: "Materials" },
  { id: "004", name: "Wood Filler (250ml)",        unitType: "Can",    unitCost: 7.25,  inStock: 12, supplier: "Hardware Inc", location: "Storage Shed B", dateCreated: "2024-02-01", lastUpdated: "2024-02-20", category: "Materials" },
  { id: "005", name: "Blue Painter's Tape 1\"",   unitType: "Roll",   unitCost: 3.00,  inStock: 16, supplier: "Hardware Inc", location: "Storage Shed A", dateCreated: "2024-01-15", lastUpdated: "2024-02-22", category: "Materials" },
  { id: "006", name: "Heavy Duty Drop Cloth",      unitType: "Piece",  unitCost: 18.00, inStock: 6,  supplier: "JewLuxe",     location: "Storage Shed A", dateCreated: "2024-01-20", lastUpdated: "2024-02-25", category: "Materials" },
  { id: "007", name: "Caulk (White, 300ml)",       unitType: "Tube",   unitCost: 4.50,  inStock: 20, supplier: "Hardware Inc", location: "Storage Shed C", dateCreated: "2024-02-05", lastUpdated: "2024-02-28", category: "Materials" },
  { id: "008", name: "Paint Thinner (500ml)",      unitType: "Bottle", unitCost: 5.50,  inStock: 10, supplier: "JewLuxe",     location: "Storage Shed C", dateCreated: "2024-01-25", lastUpdated: "2024-03-01", category: "Materials" },
  { id: "009", name: "Plastic Sheet (x12 ft)",     unitType: "Sheet",  unitCost: 0.80,  inStock: 60, supplier: "Hardware Inc", location: "Storage Shed A", dateCreated: "2024-02-10", lastUpdated: "2024-03-02", category: "Materials" },
  { id: "010", name: "Sandpaper (1000 Grit)",      unitType: "Sheet",  unitCost: 6.25,  inStock: 15, supplier: "Hardware Inc", location: "Storage Shed A", dateCreated: "2024-02-12", lastUpdated: "2024-03-03", category: "Materials" },
  { id: "011", name: "Black Latex Primer (1L)",    unitType: "Can",    unitCost: 50.99, inStock: 8,  supplier: "JewLuxe",     location: "Storage Shed A", dateCreated: "2024-01-10", lastUpdated: "2024-02-15", category: "Materials" },
  { id: "012", name: "Sandpaper (400 Grit)",       unitType: "Sheet",  unitCost: 0.80,  inStock: 15, supplier: "Hardware Inc", location: "Storage Shed B", dateCreated: "2024-02-15", lastUpdated: "2024-03-04", category: "Materials" },
]

const DUMMY_EQUIPMENT: InventoryEquipment[] = [
  { id: "E001", name: "Airless Paint Sprayer",    serialNumber: "SN-APS-001", condition: "Good",         assignedTo: "Marco Dela Cruz",  location: "Storage Shed A", purchaseDate: "2022-03-15", lastServiced: "2024-12-01", category: "Equipment" },
  { id: "E002", name: "Extension Ladder (8m)",    serialNumber: "SN-EL8-002", condition: "Good",         assignedTo: null,               location: "Storage Shed B", purchaseDate: "2021-06-10", lastServiced: "2024-11-15", category: "Equipment" },
  { id: "E003", name: "Air Compressor (50L)",     serialNumber: "SN-AC50-003",condition: "Fair",         assignedTo: "Ramon Santos",     location: "Storage Shed A", purchaseDate: "2020-09-20", lastServiced: "2024-10-30", category: "Equipment" },
  { id: "E004", name: "Pressure Washer",          serialNumber: "SN-PW-004",  condition: "Under Repair", assignedTo: null,               location: "Workshop",       purchaseDate: "2022-01-05", lastServiced: "2024-09-12", category: "Equipment" },
  { id: "E005", name: "Paint Mixer (Electric)",   serialNumber: "SN-PME-005", condition: "Good",         assignedTo: "Jessa Mendoza",    location: "Storage Shed C", purchaseDate: "2023-04-18", lastServiced: "2025-01-05", category: "Equipment" },
  { id: "E006", name: "HEPA Respirator (Set)",    serialNumber: "SN-HR-006",  condition: "Good",         assignedTo: null,               location: "Storage Shed A", purchaseDate: "2023-08-22", lastServiced: "2024-12-20", category: "Equipment" },
  { id: "E007", name: "Scaffold Platform (3m)",   serialNumber: "SN-SP3-007", condition: "Fair",         assignedTo: null,               location: "Storage Shed B", purchaseDate: "2021-11-30", lastServiced: "2024-08-14", category: "Equipment" },
]

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

function applyQuery<T extends { name: string }>(rows: T[], q: string): T[] {
  const query = q.trim().toLowerCase()
  if (!query) return rows
  return rows.filter((r) => r.name.toLowerCase().includes(query))
}

function applyMaterialFilters(
  rows: InventoryMaterial[],
  params: ListInventoryParams
): InventoryMaterial[] {
  let out = rows.slice()
  if (params.query)    out = applyQuery(out, params.query)
  if (params.supplier) out = out.filter((r) => r.supplier === params.supplier)
  if (params.location) out = out.filter((r) => r.location === params.location)
  return out
}

function applyEquipmentFilters(
  rows: InventoryEquipment[],
  params: ListInventoryParams
): InventoryEquipment[] {
  let out = rows.slice()
  if (params.query)    out = applyQuery(out, params.query)
  if (params.location) out = out.filter((r) => r.location === params.location)
  return out
}

// ---------------------------------------------------------------------------
// Derived helpers
// ---------------------------------------------------------------------------

/** Compute stock status label from quantity */
export function getStockStatus(inStock: number): StockStatus {
  if (inStock === 0) return "Out of Stock"
  if (inStock <= 5)  return "Low Stock"
  return "In Stock"
}

/** Returns all unique supplier names from materials */
export async function listMaterialSuppliers(): Promise<string[]> {
  await fakeDelay(50)
  const set = new Set(DUMMY_MATERIALS.map((m) => m.supplier))
  return Array.from(set).sort()
}

/** Returns all unique storage location names */
export async function listStorageLocations(): Promise<string[]> {
  await fakeDelay(50)
  const set = new Set([
    ...DUMMY_MATERIALS.map((m) => m.location),
    ...DUMMY_EQUIPMENT.map((e) => e.location),
  ])
  return Array.from(set).sort()
}

// ---------------------------------------------------------------------------
// Public API
// (Later: swap each function body for a real Supabase query)
// ---------------------------------------------------------------------------

/** List materials with optional filtering */
export async function listMaterials(
  params: ListInventoryParams = {}
): Promise<InventoryMaterial[]> {
  await fakeDelay(200)
  // Dummy values (later: swap to Supabase query results)
  let rows = applyMaterialFilters(DUMMY_MATERIALS, params)
  if (typeof params.limit === "number") rows = rows.slice(0, params.limit)
  return rows
}

/** List equipment with optional filtering */
export async function listEquipment(
  params: ListInventoryParams = {}
): Promise<InventoryEquipment[]> {
  await fakeDelay(200)
  // Dummy values (later: swap to Supabase query results)
  let rows = applyEquipmentFilters(DUMMY_EQUIPMENT, params)
  if (typeof params.limit === "number") rows = rows.slice(0, params.limit)
  return rows
}

/** Get a single material by ID */
export async function getMaterial(id: string): Promise<InventoryMaterial | null> {
  await fakeDelay(100)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_MATERIALS.find((m) => m.id === id) ?? null
}

/** Get a single equipment item by ID */
export async function getEquipment(id: string): Promise<InventoryEquipment | null> {
  await fakeDelay(100)
  // Dummy values (later: swap to Supabase query results)
  return DUMMY_EQUIPMENT.find((e) => e.id === id) ?? null
}

/** Summary counts for the inventory overview */
export async function getInventorySummary(): Promise<{
  totalMaterials: number
  totalEquipment: number
  lowStockCount: number
  outOfStockCount: number
}> {
  await fakeDelay(150)
  // Dummy values (later: swap to Supabase query results)
  return {
    totalMaterials: DUMMY_MATERIALS.length,
    totalEquipment: DUMMY_EQUIPMENT.length,
    lowStockCount: DUMMY_MATERIALS.filter((m) => m.inStock > 0 && m.inStock <= 5).length,
    outOfStockCount: DUMMY_MATERIALS.filter((m) => m.inStock === 0).length,
  }
}
