'use client'

import React, { useState } from 'react'
import type { InventoryItem } from '@/lib/inventoryitem'
import { ItemDetailsModal } from '@/components/item-details-modal'
import { BulkCreateModal } from '@/components/bulk-create-modal'
import { InventoryToolbar } from '@/components/inventorytoolbar' // Added Import

const MOCK_MATERIALS: InventoryItem[] = [
  {
    id: "001",
    name: "White Latex Primer (1L)",
    unitType: "Can",
    unitCost: 32.00,
    inStock: 8,
    supplier: "JewLuxe",
    location: "Storage Shed A",
    dateCreated: "2024-01-10",
    lastUpdated: "2024-02-15",
  },
  {
    id: "002",
    name: "White Latex Primer (1L)",
    unitType: "Can",
    unitCost: 32.00,
    inStock: 8,
    supplier: "JewLuxe",
    location: "Storage Shed A",
    dateCreated: "2024-01-10",
    lastUpdated: "2024-02-15",
  },
  {
    id: "003",
    name: "Satin Wall Paint (4L)",
    unitType: "Can",
    unitCost: 98.00,
    inStock: 5,
    supplier: "JewLuxe",
    location: "Storage Shed A",
    dateCreated: "2024-01-12",
    lastUpdated: "2024-02-18",
  },
  {
    id: "004",
    name: "Wood Filler (250ml)",
    unitType: "Can",
    unitCost: 7.25,
    inStock: 12,
    supplier: "Hardware Inc",
    location: "Storage Shed B",
    dateCreated: "2024-02-01",
    lastUpdated: "2024-02-20",
  },
  {
    id: "005",
    name: "Blue Painter's Tape 1\"",
    unitType: "Roll",
    unitCost: 3.00,
    inStock: 16,
    supplier: "Hardware Inc",
    location: "Storage Shed A",
    dateCreated: "2024-01-15",
    lastUpdated: "2024-02-22",
  },
  {
    id: "006",
    name: "Heavy Duty Drop Cloth",
    unitType: "Piece",
    unitCost: 18.00,
    inStock: 6,
    supplier: "JewLuxe",
    location: "Storage Shed A",
    dateCreated: "2024-01-20",
    lastUpdated: "2024-02-25",
  },
  {
    id: "007",
    name: "Caulk (White, 300ml)",
    unitType: "Tube",
    unitCost: 4.50,
    inStock: 20,
    supplier: "Hardware Inc",
    location: "Storage Shed C",
    dateCreated: "2024-02-05",
    lastUpdated: "2024-02-28",
  },
  {
    id: "008",
    name: "Paint Thinner (500ml)",
    unitType: "Bottle",
    unitCost: 5.50,
    inStock: 10,
    supplier: "JewLuxe",
    location: "Storage Shed C",
    dateCreated: "2024-01-25",
    lastUpdated: "2024-03-01",
  },
  {
    id: "009",
    name: "Plastic Sheet (x12 ft)",
    unitType: "Sheet",
    unitCost: 0.80,
    inStock: 60,
    supplier: "Hardware Inc",
    location: "Storage Shed A",
    dateCreated: "2024-02-10",
    lastUpdated: "2024-03-02",
  },
  {
    id: "010",
    name: "Sandpaper (1000 Grit)",
    unitType: "Sheet",
    unitCost: 6.25,
    inStock: 15,
    supplier: "Hardware Inc",
    location: "Storage Shed A",
    dateCreated: "2024-02-12",
    lastUpdated: "2024-03-03",
  },
  {
    id: "011",
    name: "Black Latex Primer (1L)",
    unitType: "Can",
    unitCost: 50.99,
    inStock: 8,
    supplier: "JewLuxe",
    location: "Storage Shed A",
    dateCreated: "2024-01-10",
    lastUpdated: "2024-02-15",
  },
  {
    id: "012",
    name: "Sandpaper (400 Grit)",
    unitType: "Sheet",
    unitCost: 0.80,
    inStock: 15,
    supplier: "Hardware Inc",
    location: "Storage Shed B",
    dateCreated: "2024-02-15",
    lastUpdated: "2024-03-04",
  },
];

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
      <div className="mb-4">
        <InventoryToolbar onCreate={() => setIsCreateOpen(true)} />
      </div>

      {/* --- TABLE --- */}
      <div className="bg-white shadow-sm rounded-lg flex-1 overflow-auto min-h-0">
        <table className="w-full text-left text-sm relative">
          {/* Table Headers */}
          <thead className="bg-gray-50 border-b sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="p-4">Material ID</th>
              <th className="p-4">Name</th>
              <th className="p-4">Material Type</th>
              <th className="p-4">Unit Cost (AU$)</th>
              <th className="p-4">In Stock</th>
              <th className="p-4">Location Stored</th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody>
            {MOCK_MATERIALS.map((item) => (
              <tr
                key={item.id}
                className="border-b hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => setSelectedItem(item)}
              >
                <td className="p-4 font-medium text-gray-900">{item.id}</td>
                <td className="p-4 text-gray-800">{item.name}</td>
                <td className="p-4 text-gray-600">{item.unitType}</td>
                <td className="p-4 text-gray-600">${item.unitCost.toFixed(2)}</td>
                <td className="p-4 text-gray-600">{item.inStock}</td>
                <td className="p-4 text-gray-500">{item.location}</td>
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