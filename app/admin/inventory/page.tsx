'use client'

import React, { useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Filter,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'

const INVENTORY_DATA = [
  {
    id: 1,
    name: 'White Latex Primer (1L)',
    unitCost: 32.0,
    inStock: 7,
    reorderPoint: 4,
    tags: ['Paint Can'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: null,
  },
  {
    id: 2,
    name: 'Satin Wall Paint (4L)',
    unitCost: 98.0,
    inStock: 5,
    reorderPoint: 6,
    tags: ['Paint Can', 'Satin'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: 'low',
  },
  {
    id: 3,
    name: 'Minwax Stainable (250ml)',
    unitCost: 7.25,
    inStock: 12,
    reorderPoint: 5,
    tags: ['Epoxy', 'Wood Filler'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: null,
  },
  {
    id: 4,
    name: `Blue Painter's Tape 1"`,
    unitCost: 3.0,
    inStock: 16,
    reorderPoint: 15,
    tags: ['Tape'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: 'alert',
  },
  {
    id: 5,
    name: 'Heavy Duty Drop Cloth',
    unitCost: 18.0,
    inStock: 6,
    reorderPoint: 3,
    tags: ['Cover Cloth'],
    supplier: 'JewLuxe',
    location: 'Tool Shed B',
    warning: null,
  },
  {
    id: 6,
    name: 'Caulk (White, 300ml)',
    unitCost: 4.5,
    inStock: 20,
    reorderPoint: 10,
    tags: ['Sealant', 'Caulk'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: null,
  },
  {
    id: 7,
    name: 'Paint Thinner (500ml)',
    unitCost: 5.5,
    inStock: 10,
    reorderPoint: 5,
    tags: ['Paint Can', 'Thinner'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: null,
  },
  {
    id: 8,
    name: 'Sandpaper (1000 Grit)',
    unitCost: 0.8,
    inStock: 60,
    reorderPoint: 20,
    tags: ['Sandpaper'],
    supplier: 'JewLuxe',
    location: 'Tool Shed B',
    warning: null,
  },
  {
    id: 9,
    name: 'Plastic Sheet (x12 ft)',
    unitCost: 6.25,
    inStock: 15,
    reorderPoint: 5,
    tags: ['Cover Cloth'],
    supplier: 'JewLuxe',
    location: 'Tool Shed A',
    warning: null,
  },
]

const TAG_COLORS: Record<string, string> = {
  'Paint Can': 'bg-blue-100 text-blue-700',
  Satin: 'bg-pink-100 text-pink-700',
  Epoxy: 'bg-green-100 text-green-700',
  'Wood Filler': 'bg-green-100 text-green-700',
  Tape: 'bg-yellow-100 text-yellow-700',
  'Cover Cloth': 'bg-amber-100 text-amber-700',
  Sealant: 'bg-purple-100 text-purple-700',
  Caulk: 'bg-blue-100 text-blue-700',
  Thinner: 'bg-blue-100 text-blue-700',
  Sandpaper: 'bg-green-100 text-green-700',
}

function TagBadge({ tag, hasNext }: { tag: string; hasNext?: boolean }) {
  const colorClass = TAG_COLORS[tag] || 'bg-gray-100 text-gray-700'
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          // keep badges soft, but align with admin system (no pill overload)
          'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
          colorClass,
        )}
      >
        {tag}
      </span>
      {hasNext && <ChevronRight className="h-3 w-3 text-gray-300" />}
    </div>
  )
}

function SupplierBadge({ supplier }: { supplier: string }) {
  return (
    <span className="inline-flex items-center rounded-md bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      {supplier}
    </span>
  )
}

function LocationBadge({ location }: { location: string }) {
  const isToolShedB = location === 'Tool Shed B'
  const bgColor = isToolShedB ? 'bg-green-200' : 'bg-green-100'
  const textColor = isToolShedB ? 'text-green-800' : 'text-green-700'

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium',
        bgColor,
        textColor,
      )}
    >
      {location}
    </span>
  )
}

function WarningIcon({ type }: { type: string | null }) {
  if (!type) return null
  if (type === 'low') return <AlertTriangle className="h-4 w-4 text-red-500" />
  if (type === 'alert') return <AlertCircle className="h-4 w-4 text-yellow-500" />
  return null
}

export default function AdminInventory() {
  const [materialsOpen, setMaterialsOpen] = useState(true)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [sortBy, setSortBy] = useState<'Latest' | 'Unit Cost' | 'Reorder Point'>(
    'Latest',
  )

  const filteredData = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return INVENTORY_DATA
    return INVENTORY_DATA.filter((item) => {
      const hay = [
        item.name,
        item.supplier,
        item.location,
        ...item.tags,
        String(item.unitCost),
        String(item.inStock),
        String(item.reorderPoint),
      ]
        .join(' ')
        .toLowerCase()
      return hay.includes(q)
    })
  }, [searchQuery])

  const sortedData = useMemo(() => {
    const data = [...filteredData]
    if (sortBy === 'Unit Cost') data.sort((a, b) => b.unitCost - a.unitCost)
    if (sortBy === 'Reorder Point') data.sort((a, b) => b.reorderPoint - a.reorderPoint)
    // Latest: keep as-is (mock list order)
    return data
  }, [filteredData, sortBy])

  const handleSelectAll = (checked: boolean) => {
    if (checked) setSelectedItems(sortedData.map((item) => item.id))
    else setSelectedItems([])
  }

  const handleSelectItem = (id: number, checked: boolean) => {
    if (checked) setSelectedItems((prev) => [...prev, id])
    else setSelectedItems((prev) => prev.filter((x) => x !== id))
  }

  const allChecked = sortedData.length > 0 && selectedItems.length === sortedData.length
  const someChecked =
    selectedItems.length > 0 && selectedItems.length < sortedData.length

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Inventory</h1>

      <div className="mt-6">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative w-full sm:max-w-xs">
              <Input
                type="text"
                placeholder="Search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-10 rounded-lg border border-gray-200 bg-white pr-9 text-sm text-gray-900 placeholder:text-gray-500 shadow-sm"
              />
              <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>

            <Button
              className="h-10 gap-2 rounded-lg bg-[#00c065] px-3 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054]"
              onClick={() => console.log('New item')}
            >
              <Plus className="h-4 w-4" />
              New
            </Button>

            <Button
              variant="ghost"
              className="h-10 gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50"
              onClick={() => console.log('Filters')}
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex h-10 items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50">
                Sort by: <span className="font-normal">{sortBy}</span>
                <ChevronDown className="h-4 w-4 text-gray-400" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="rounded-lg border border-gray-200 shadow-sm">
                <DropdownMenuItem onClick={() => setSortBy('Latest')}>Latest</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('Unit Cost')}>Unit Cost</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSortBy('Reorder Point')}>
                  Reorder Point
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="text-sm text-gray-600">
            {selectedItems.length > 0 ? (
              <span>
                <span className="font-semibold text-gray-900">{selectedItems.length}</span>{' '}
                selected
              </span>
            ) : (
              <span>
                <span className="font-semibold text-gray-900">{sortedData.length}</span>{' '}
                items
              </span>
            )}
          </div>
        </div>

        {/* Materials Card */}
        <div className="mt-6 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Collapsible open={materialsOpen} onOpenChange={setMaterialsOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    !materialsOpen && '-rotate-90',
                  )}
                />
                Materials
              </div>
              <div className="text-xs font-medium text-gray-500">
                {sortedData.length} items
              </div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="w-10 px-3 py-3 text-left">
                        <Checkbox
                          checked={allChecked}
                          onCheckedChange={(checked) =>
                            handleSelectAll(checked as boolean)
                          }
                          // if your Checkbox supports indeterminate via data-state, this will still be fine.
                          className={cn(someChecked && !allChecked && 'data-[state=checked]:opacity-100')}
                        />
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Name
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Unit Cost (AUS)
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        In Stock
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Reorder Point
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Tags
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Supplier
                      </th>
                      <th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-600">
                        Location
                      </th>
                    </tr>
                  </thead>

                  <tbody>
                    {sortedData.map((item) => (
                      <tr key={item.id} className="border-b border-gray-100 hover:bg-gray-50">
                        <td className="px-3 py-3">
                          <Checkbox
                            checked={selectedItems.includes(item.id)}
                            onCheckedChange={(checked) =>
                              handleSelectItem(item.id, checked as boolean)
                            }
                          />
                        </td>
                        <td className="px-3 py-3 font-medium text-gray-900">
                          {item.name}
                        </td>
                        <td className="px-3 py-3 text-gray-700">
                          ${item.unitCost.toFixed(2)}
                        </td>
                        <td className="px-3 py-3 text-gray-700">{item.inStock}</td>
                        <td className="px-3 py-3 text-gray-700">
                          <div className="flex items-center gap-2">
                            {item.reorderPoint}
                            <WarningIcon type={item.warning} />
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-wrap gap-1.5">
                            {item.tags.map((tag, idx) => (
                              <TagBadge
                                key={`${item.id}-${tag}`}
                                tag={tag}
                                hasNext={idx < item.tags.length - 1}
                              />
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <SupplierBadge supplier={item.supplier} />
                        </td>
                        <td className="px-3 py-3">
                          <LocationBadge location={item.location} />
                        </td>
                      </tr>
                    ))}

                    {sortedData.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-sm text-gray-500">
                          No items found.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>

        {/* Equipment Card */}
        <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
          <Collapsible open={equipmentOpen} onOpenChange={setEquipmentOpen}>
            <CollapsibleTrigger className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
                <ChevronDown
                  className={cn(
                    'h-4 w-4 transition-transform',
                    !equipmentOpen && '-rotate-90',
                  )}
                />
                Equipment
              </div>
              <div className="text-xs font-medium text-gray-500">0 items</div>
            </CollapsibleTrigger>

            <CollapsibleContent>
              <div className="mt-4 rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                <div className="py-8 text-center text-sm text-gray-500">
                  No equipment data available yet.
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        </div>
      </div>
    </div>
  )
}
