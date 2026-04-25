import React from 'react'

type InventoryTableProps = {
  data: any[]
  type: "materials" | "equipment"
  isLoading: boolean
  onRowClick: (item: any) => void
}

export default function InventoryTable({ data, type, isLoading, onRowClick }: InventoryTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-4 w-full">
        <div className="h-10 w-full bg-gray-200 animate-pulse rounded-md" />
        <div className="h-10 w-full bg-gray-200 animate-pulse rounded-md" />
        <div className="h-10 w-full bg-gray-200 animate-pulse rounded-md" />
      </div>
    )
  }

  if (data.length === 0) {
    return (
      <div className="m-auto flex flex-col items-center justify-center text-gray-400 py-12">
        <p className="text-sm">No {type} found.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-auto custom-scrollbar rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-sm text-left">
        <thead className="text-xs text-gray-500 uppercase bg-gray-50 sticky top-0 z-10 shadow-[0_1px_0_#e5e7eb]">
          <tr>
            <th className="px-5 py-3.5 font-semibold">Item Name</th>
            <th className="px-5 py-3.5 font-semibold">Location</th>
            <th className="px-5 py-3.5 font-semibold">Supplier</th>
            <th className="px-5 py-3.5 font-semibold">
              {type === 'materials' ? 'Stock Details' : 'Condition / Status'}
            </th>
            <th className="px-5 py-3.5 font-semibold text-right">Unit Cost</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {data.map((item) => {
            const id = item.material_id || item.equipment_id;
            
            return (
              <tr 
                key={id} 
                onClick={() => onRowClick(item)}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <td className="px-5 py-3">
                  <div className="font-semibold text-gray-900">{item.name}</div>
                  {item.tag && (
                    <span 
                      className="inline-block mt-1 px-2 py-0.5 text-[10px] font-bold rounded-full border uppercase tracking-wide" 
                      style={{ 
                        color: item.tag.color || '#6b7280', 
                        borderColor: item.tag.color || '#e5e7eb', 
                        backgroundColor: `${item.tag.color || '#e5e7eb'}15` 
                      }}
                    >
                      {item.tag.tag_name}
                    </span>
                  )}
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {item.location || <span className="text-gray-400 italic">Unassigned</span>}
                </td>
                <td className="px-5 py-3 text-gray-600">
                  {item.supplier ? (
                    <span 
                      className="inline-block px-2.5 py-0.5 text-xs font-medium rounded-full border"
                      style={{
                        color: item.supplier.color || '#d97706',
                        borderColor: item.supplier.color || '#fcd34d',
                        backgroundColor: `${item.supplier.color || '#fcd34d'}15`
                      }}
                    >
                      {item.supplier.supplier_name}
                    </span>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  {type === 'materials' ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="text-gray-900 font-medium">In Stock: {item.current_in_stock || 0}</span>
                      <span className="text-xs text-gray-500">Reorder Pt: {item.reorder_point}</span>
                      <span className="text-xs text-gray-500">Unit: {item.unit}</span>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      <span className={`font-medium ${item.status === 'Available' ? 'text-[#00c065]' : 'text-red-500'}`}>
                        {item.status}
                      </span>
                      <span className="text-xs text-gray-500 capitalize">{item.condition || "Unknown Condition"}</span>
                    </div>
                  )}
                </td>
                <td className="px-5 py-3 text-right font-semibold text-gray-900">
                  ₱{(item.unit_cost || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}