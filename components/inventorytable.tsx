import React from "react"
import { Loader2, AlertTriangle, AlertOctagon } from "lucide-react"

type InventoryTableItem = {
  id?: string
  material_id?: string
  equipment_id?: string
  name?: string
  location?: {
    name?: string | null
  } | null
  supplier?: {
    supplier_name?: string | null
    color?: string | null
  } | null
  tag?: {
    tag_name?: string | null
    color?: string | null
  } | null
  current_in_stock?: number | null
  quantity?: number | null
  reorder_point?: number | null
  needed_stock?: number | null
  unit?: string | null
  status?: string | null
  unit_cost?: number | null
}

type InventoryTableProps = {
  data: InventoryTableItem[]
  type: "materials" | "equipment"
  isLoading: boolean
  onRowClick: (item: InventoryTableItem) => void
}

function getItemId(item: InventoryTableItem) {
  return item.id || item.material_id || item.equipment_id || item.name || "inventory-item"
}

function getSupplierLabel(item: InventoryTableItem) {
  return item.supplier?.supplier_name || null
}

function getSupplierColor(item: InventoryTableItem) {
  return item.supplier?.color || null
}

function getStockValue(item: InventoryTableItem, type: string) {
  return type === "materials" ? (item.current_in_stock ?? 0) : (item.quantity ?? 0)
}

function formatUnit(unit: string | null | undefined, quantity: number) {
  if (!unit) return ""
  const match = unit.match(/\(([^)]+)\)/)
  if (match) {
    const abbr = match[1]
    if (abbr.toLowerCase() === "pc" && quantity !== 1) return "pcs"
    return abbr
  }
  if (quantity !== 1 && !unit.toLowerCase().endsWith('s')) return unit + "s"
  return unit
}

export default function InventoryTable({ data, type, isLoading, onRowClick }: InventoryTableProps) {
  if (isLoading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin text-gray-500" /></div>
  if (!data || data.length === 0) return <div className="m-auto flex flex-col items-center justify-center text-gray-400 py-12"><p className="text-sm">No items found matching your filters.</p></div>

  return (
    <div className="flex-1 overflow-auto custom-scrollbar rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-[0_1px_0_#e5e7eb]">
          <tr>
            <th className="px-5 py-3.5 font-semibold">Item Name</th>
            <th className="px-5 py-3.5 font-semibold">Location</th>
            <th className="px-5 py-3.5 font-semibold">Supplier</th>
            <th className="px-5 py-3.5 font-semibold">Status / Details</th>
            {type === "materials" && <th className="px-5 py-3.5 font-semibold text-center">Needed Stock</th>}
            {type === "materials" && <th className="px-5 py-3.5 font-semibold text-right">Unit Cost</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item) => {
            const id = getItemId(item)
            const supplierLabel = getSupplierLabel(item)
            const supplierColor = getSupplierColor(item)
            
            const stock = getStockValue(item, type)
            const reorderPoint = item.reorder_point ?? 0
            const neededStock = item.needed_stock ?? 0
            
            const isBelowReorder = type === "materials" && stock < reorderPoint
            const isNearReorder = type === "materials" && !isBelowReorder && stock <= (reorderPoint + 1)
            const hasNeededStock = type === "materials" && neededStock > 0

            return (
              <tr key={id} onClick={() => onRowClick(item)} className="hover:bg-gray-50 transition-colors cursor-pointer">
                <td className="px-5 py-3">
                  <div className="font-semibold text-gray-900">{item.name || "Unnamed Item"}</div>
                  {item.tag?.tag_name && (
                    <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wide" style={{ color: item.tag.color || "#6b7280", borderColor: item.tag.color || "#e5e7eb", backgroundColor: `${item.tag.color || "#e5e7eb"}15` }}>
                      {item.tag.tag_name}
                    </span>
                  )}
                </td>
                
                <td className="px-5 py-3 text-gray-600">{item.location?.name || <span className="text-gray-400 italic">Unassigned</span>}</td>
                
                <td className="px-5 py-3 text-gray-600">
                  {supplierLabel ? (
                    <span className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full border" style={{ color: supplierColor || "#d97706", borderColor: supplierColor || "#fcd34d", backgroundColor: `${supplierColor || "#fcd34d"}15` }}>
                      {supplierLabel}
                    </span>
                  ) : <span className="text-gray-400">-</span>}
                </td>

                <td className="px-5 py-3">
                  <div className="flex flex-col gap-1">
                    <span className={`w-fit px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                        item.status === 'Available' || item.status === 'Active' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 
                        item.status === 'Needs Reorder' ? 'bg-orange-100 text-orange-700 border border-orange-200' : 
                        item.status === 'In Use' ? 'bg-blue-100 text-blue-700 border border-blue-200' : 
                        item.status === 'Archived' ? 'bg-gray-200 text-gray-600 border border-gray-300' : 
                        'bg-gray-100 text-gray-700 border border-gray-200'
                      }`}
                    >
                      {item.status || 'Active'}
                    </span>
                    
                    {type === "materials" && (
                      <>
                        <span className="text-gray-900 text-xs font-medium mt-0.5">
                          In Stock: {stock} {formatUnit(item.unit, stock)}
                        </span>
                        
                        {/* Display Reorder Point Warning */}
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          Reorder Pt: {reorderPoint}
                          {isBelowReorder && !hasNeededStock && <AlertTriangle className="w-3 h-3 text-red-500 fill-red-500" />}
                          {isNearReorder && !hasNeededStock && <AlertTriangle className="w-3 h-3 text-yellow-500 fill-yellow-500" />}
                        </span>
                      </>
                    )}
                  </div>
                </td>

                {/* NEW NEEDED STOCK COLUMN */}
                {type === "materials" && (
                  <td className="px-5 py-3 text-center">
                    {hasNeededStock ? (
                      <div className="inline-flex items-center justify-center gap-1.5 bg-red-50 text-red-700 px-2.5 py-1 rounded-md border border-red-200 font-semibold text-xs shadow-sm">
                        {neededStock} <AlertOctagon className="w-3.5 h-3.5 text-red-600 fill-red-200" />
                      </div>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                )}

                {type === "materials" && (
                  <td className="px-5 py-3 text-right font-semibold text-gray-900">
                    PHP {(item.unit_cost ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}