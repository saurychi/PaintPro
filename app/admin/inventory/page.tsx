'use client'

import React, { useState } from 'react'
import { Plus, Filter, Search } from 'lucide-react'
import { InventoryTable } from '@/components/inventorytable'
import { ItemDetailsModal } from '@/components/item-details-modal'
import { BulkCreateModal } from '@/components/bulk-create-modal'

// --- 1. MOCK DATA (As requested by lead) ---
type InventoryItem = {
  id: string
  name: string
  category: 'Material' | 'Equipment'
  unitCost: number
  inStock: number
  supplier: string
  dateCreated: string
}

const MOCK_MATERIALS: InventoryItem[] = [
  { id: 'MAT-001', name: 'White Latex Primer', category: 'Material', unitCost: 32.0, inStock: 8, supplier: 'JewLuxe', dateCreated: '2024-01-15' },
  // ... add more items
]

export default function AdminInventory() {
  const [activeTab, setActiveTab] = useState<'Materials' | 'Equipment'>('Materials')
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null) // Triggers Details Modal
  const [isCreateOpen, setIsCreateOpen] = useState(false) // Triggers Create Modal

  return (
    <div className="p-6 h-screen flex flex-col">
      {/* --- HEADER --- */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex gap-2 bg-gray-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('Materials')}
            className={`px-4 py-2 rounded-md text-sm ${activeTab === 'Materials' ? 'bg-white shadow text-black' : 'text-gray-500'}`}
          >
            Materials
          </button>
          <button 
            onClick={() => setActiveTab('Equipment')}
            className={`px-4 py-2 rounded-md text-sm ${activeTab === 'Equipment' ? 'bg-white shadow text-black' : 'text-gray-500'}`}
          >
            Equipment
          </button>
        </div>
      </div>

      {/* --- TOOLBAR --- */}
      <div className="flex justify-between mb-4">
        <div className="relative w-96">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
          <input className="pl-10 h-10 w-full rounded-md border border-gray-300" placeholder="Search..." />
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-gray-50">
            <Filter className="h-4 w-4" /> Filter
          </button>
          <button 
            onClick={() => setIsCreateOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
      </div>

      {/* --- TABLE --- */}
      <div className="border rounded-lg overflow-hidden">
        {/* Replace this with your v0 <InventoryTable /> */}
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
                <td className="p-4">${item.unitCost}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* --- MODALS --- */}
      {selectedItem && (
        <ItemDetailsModal 
          isOpen={!!selectedItem} 
          item={selectedItem} 
          onClose={() => setSelectedItem(null)} 
        />
      )}

      {isCreateOpen && (
        <BulkCreateModal 
          isOpen={isCreateOpen} 
          onClose={() => setIsCreateOpen(false)} 
        />
      )}
    </div>
  )
}