'use client'

import React, { useState } from 'react'
import { Plus, Filter, Search } from 'lucide-react'
import type { InventoryItem } from '@/lib/inventoryitem'
import { ItemDetailsModal } from '@/components/item-details-modal'
import { BulkCreateModal } from '@/components/bulk-create-modal'

// Keep mock data here, but it must match the shared InventoryItem type
const MOCK_MATERIALS: InventoryItem[] = [
  {
    id: "INV001",
    name: "Stainless Steel Fastener Kit",
    unitType: "Hardware",
    unitCost: 45.99,
    inStock: 250,
    supplier: "Pacific Industrial Supply",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-01-15",
    lastUpdated: "2025-02-20",
  },
  {
    id: "INV002",
    name: "Premium Cotton Fabric Roll",
    unitType: "Textiles",
    unitCost: 28.50,
    inStock: 75,
    supplier: "Global Textiles Ltd",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-03-22",
    lastUpdated: "2025-02-18",
  },
  {
    id: "INV003",
    name: "LED Lighting Module 24W",
    unitType: "Electronics",
    unitCost: 156.75,
    inStock: 42,
    supplier: "TechCore Components",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-05-10",
    lastUpdated: "2025-02-25",
  },
  {
    id: "INV004",
    name: "Polyurethane Foam Sheet (1m x 2m)",
    unitType: "Materials",
    unitCost: 72.40,
    inStock: 18,
    supplier: "EuroFoam Industries",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-02-28",
    lastUpdated: "2025-02-19",
  },
  {
    id: "INV005",
    name: "Aluminum Extrusion Profile",
    unitType: "Metals",
    unitCost: 89.25,
    inStock: 125,
    supplier: "MetalTech Solutions",
    location: "Warehouse A - Shelf 3",
    dateCreated: "2024-06-12",
    lastUpdated: "2025-02-21",
  },
]

export default function AdminInventory() {
  const [activeTab, setActiveTab] = useState<'Materials' | 'Equipment'>('Materials')
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null)
  const [isCreateOpen, setIsCreateOpen] = useState(false)

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* --- HEADER --- */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>

        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab('Materials')}
            className={`px-4 py-2 rounded-md text-sm ${
              activeTab === 'Materials' ? 'bg-white shadow text-black' : 'text-gray-500'
            }`}
          >
            Materials
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('Equipment')}
            className={`px-4 py-2 rounded-md text-sm ${
              activeTab === 'Equipment' ? 'bg-white shadow text-black' : 'text-gray-500'
            }`}
          >
            Equipment
          </button>
        </div>
      </div>

      {/* --- TOOLBAR --- */}
      <div className="flex justify-between mb-4">
        <div className="relative w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input
            className="pl-10 h-10 w-full rounded-md border border-gray-300"
            placeholder="Search..."
          />
        </div>

        <div className="flex gap-3">
          <button
            type="button"
            className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50"
          >
            <Filter className="h-4 w-4" /> Filter
          </button>

          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Stock</th>
              <th className="p-4">Cost</th>
            </tr>
          </thead>

          <tbody>
            {MOCK_MATERIALS.map((item) => (
              <tr
                key={item.id}
                className="border-b hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedItem(item)}
              >
                <td className="p-4">{item.name}</td>
                <td className="p-4">{item.inStock}</td>
                <td className="p-4">${item.unitCost.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODALS --- */}
      <ItemDetailsModal
        isOpen={!!selectedItem}
        selectedItem={selectedItem}
        onClose={() => setSelectedItem(null)}
      />

      {isCreateOpen && (
        <BulkCreateModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} />
      )}
    </div>
  )
}
