'use client'

import React, { useState } from 'react'
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

// Hardcoded inventory data
const INVENTORY_DATA = [
  {
    id: 1,
    name: 'White Latex Primer (1L)',
    unitCost: 32.0,
    inStock: 8,
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
    name: 'Minwax Stainable(250ml)',
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
    name: "Blue Painter's Tape 1\"",
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

// Tag color mapping
const TAG_COLORS: Record<string, string> = {
  'Paint Can': 'bg-blue-100 text-blue-700',
  'Satin': 'bg-pink-100 text-pink-700',
  'Epoxy': 'bg-green-100 text-green-700',
  'Wood Filler': 'bg-green-100 text-green-700',
  'Tape': 'bg-yellow-100 text-yellow-700',
  'Cover Cloth': 'bg-amber-100 text-amber-700',
  'Sealant': 'bg-purple-100 text-purple-700',
  'Caulk': 'bg-blue-100 text-blue-700',
  'Thinner': 'bg-blue-100 text-blue-700',
  'Sandpaper': 'bg-green-100 text-green-700',
}

function TagBadge({ tag, hasNext }: { tag: string; hasNext?: boolean }) {
  const colorClass = TAG_COLORS[tag] || 'bg-gray-100 text-gray-700'
  return (
    <div className="flex items-center gap-1">
      <span
        className={cn(
          'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
          colorClass,
        )}
      >
        {tag}
      </span>
      {hasNext && <ChevronRight className="h-3 w-3 text-gray-400" />}
    </div>
  )
}

function SupplierBadge({ supplier }: { supplier: string }) {
  return (
    <span className="inline-block rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-medium text-amber-700">
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
        'inline-block rounded-full px-2.5 py-0.5 text-xs font-medium',
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
  if (type === 'low')
    return <AlertTriangle className="h-5 w-5 text-red-500" />
  if (type === 'alert') return <AlertCircle className="h-5 w-5 text-yellow-500" />
  return null
}

export default function InventoryView() {
  const [materialsOpen, setMaterialsOpen] = useState(true)
  const [equipmentOpen, setEquipmentOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedItems, setSelectedItems] = useState<number[]>([])
  const [sortBy, setSortBy] = useState('Latest')

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedItems(INVENTORY_DATA.map((item) => item.id))
    } else {
      setSelectedItems([])
    }
  }

  const handleSelectItem = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedItems([...selectedItems, id])
    } else {
      setSelectedItems(selectedItems.filter((item) => item !== id))
    }
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="px-8 py-6">
        {/* Header */}
        <h1 className="text-3xl font-bold text-gray-900 mb-6">Inventory</h1>

        {/* Toolbar */}
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Input
              type="text"
              placeholder="Search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-500"
            />
            <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          </div>

          <Button
            className="gap-2 rounded-md bg-green-500 px-3 py-2 text-sm font-semibold text-white hover:bg-green-600"
            onClick={() => {
              // Handle new item creation
              console.log('New item')
            }}
          >
            <Plus className="h-4 w-4" />
            New
          </Button>

          <Button
            variant="ghost"
            className="gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
            onClick={() => {
              // Handle filters
              console.log('Filters')
            }}
          >
            <Filter className="h-4 w-4" />
            Filters
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger className="flex items-center gap-2 rounded-md border border-gray-300 px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50">
              Sort by: <span className="font-normal">{sortBy}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => setSortBy('Latest')}>
                Latest
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('Unit Cost')}>
                Unit Cost
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy('Reorder Point')}>
                Reorder Point
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Materials Section */}
        <Collapsible open={materialsOpen} onOpenChange={setMaterialsOpen}>
          <CollapsibleTrigger className="mb-4 flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                !materialsOpen && '-rotate-90',
              )}
            />
            Materials
          </CollapsibleTrigger>

          <CollapsibleContent>
            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="px-4 py-3 text-left">
                      <Checkbox
                        checked={
                          selectedItems.length === INVENTORY_DATA.length &&
                          INVENTORY_DATA.length > 0
                        }
                        onCheckedChange={(checked) =>
                          handleSelectAll(checked as boolean)
                        }
                      />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Name
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Unit Cost (AUS)
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      In Stock
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Reorder Point
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Tags
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Supplier
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                      Location
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {INVENTORY_DATA.map((item, index) => (
                    <tr
                      key={item.id}
                      className={cn(
                        'border-b border-gray-100',
                        index % 2 === 0 ? 'bg-white' : 'bg-gray-50',
                      )}
                    >
                      <td className="px-4 py-4">
                        <Checkbox
                          checked={selectedItems.includes(item.id)}
                          onCheckedChange={(checked) =>
                            handleSelectItem(item.id, checked as boolean)
                          }
                        />
                      </td>
                      <td className="px-4 py-4 text-gray-900 font-medium">
                        {item.name}
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        ${item.unitCost.toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-gray-700">{item.inStock}</td>
                      <td className="px-4 py-4 text-gray-700">
                        <div className="flex items-center gap-2">
                          {item.reorderPoint}
                          <WarningIcon type={item.warning} />
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {item.tags.map((tag, idx) => (
                            <TagBadge
                              key={tag}
                              tag={tag}
                              hasNext={idx < item.tags.length - 1}
                            />
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <SupplierBadge supplier={item.supplier} />
                      </td>
                      <td className="px-4 py-4">
                        <LocationBadge location={item.location} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Equipment Section */}
        <Collapsible open={equipmentOpen} onOpenChange={setEquipmentOpen}>
          <CollapsibleTrigger className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <ChevronDown
              className={cn(
                'h-4 w-4 transition-transform',
                !equipmentOpen && '-rotate-90',
              )}
            />
            Equipment
          </CollapsibleTrigger>

          <CollapsibleContent className="mt-4 p-4 text-sm text-gray-600">
            {/* Equipment content would go here */}
          </CollapsibleContent>
        </Collapsible>
      </div>
    </div>
  )
}
