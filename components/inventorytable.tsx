'use client'

import { useState } from 'react'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { InventoryItem } from '@/lib/inventoryitem'

export interface InventoryTableProps {
  data: InventoryItem[]
  onRowClick?: (id: string) => void
  onSelectionChange?: (selectedIds: string[]) => void
}

export function InventoryTable({ data, onRowClick, onSelectionChange }: InventoryTableProps) {
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set())

  const handleSelectRow = (id: string) => {
    const newSelected = new Set(selectedRows)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)

    setSelectedRows(newSelected)
    onSelectionChange?.(Array.from(newSelected))
  }

  const handleSelectAll = (_checked?: boolean | 'indeterminate') => {
    const newSelected = new Set<string>()
    if (selectedRows.size !== data.length) {
      data.forEach((item) => newSelected.add(item.id))
    }
    setSelectedRows(newSelected)
    onSelectionChange?.(Array.from(newSelected))
  }

  const formatCurrency = (amount: number) => `$${amount.toFixed(2)}`

  const headerChecked: boolean | 'indeterminate' =
    selectedRows.size === 0
      ? false
      : selectedRows.size === data.length
        ? true
        : 'indeterminate'

  return (
    <div className="w-full bg-white rounded-lg shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-gray-50 border-b border-gray-200">
            <TableHead className="w-12 px-4 py-3">
              <Checkbox checked={headerChecked} onCheckedChange={handleSelectAll} />
            </TableHead>

            <TableHead className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Material ID
            </TableHead>
            <TableHead className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Name
            </TableHead>
            <TableHead className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Material Type
            </TableHead>
            <TableHead className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">
              Unit Cost (AUS)
            </TableHead>
            <TableHead className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide text-right">
              In Stock
            </TableHead>
            <TableHead className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wide">
              Location Stored
            </TableHead>
          </TableRow>
        </TableHeader>

        <TableBody>
          {data.map((item) => (
            <TableRow
              key={item.id}
              onClick={() => onRowClick?.(item.id)}
              className="border-b border-gray-200 hover:bg-gray-50 cursor-pointer transition-colors"
            >
              <TableCell className="w-12 px-4 py-4">
                <Checkbox
                  checked={selectedRows.has(item.id)}
                  onCheckedChange={() => handleSelectRow(item.id)}
                  onClick={(e) => e.stopPropagation()}
                />
              </TableCell>

              <TableCell className="px-4 py-4 text-sm font-medium text-gray-900">
                {item.id}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-gray-700">
                {item.name}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-gray-700">
                {item.unitType}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-gray-700 text-right">
                {formatCurrency(item.unitCost)}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-gray-700 text-right">
                {item.inStock}
              </TableCell>
              <TableCell className="px-4 py-4 text-sm text-gray-700">
                {item.location}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
