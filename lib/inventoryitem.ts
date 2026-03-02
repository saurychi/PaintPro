/**
 * Inventory System Data Types
 */

export type InventoryItem = {
  id: string
  name: string
  unitType: string
  unitCost: number
  inStock: number
  supplier: string
  location: string
  dateCreated: string
  lastUpdated: string
}
