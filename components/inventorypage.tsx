'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InventoryToolbar } from './inventorytoolbar';
import  InventoryTable from './inventorytable';
import type { InventoryItem } from "@/lib/inventoryitem"

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

export function InventoryPage() {
  const [activeTab, setActiveTab] = useState('materials');
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const [selectedRows, setSelectedRows] = useState<string[]>([]);

  // Filter and search the data
  const filteredData = useMemo(() => {
    let result = MOCK_MATERIALS;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (item) =>
          item.id.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query) ||
          item.unitType.toLowerCase().includes(query) ||
          item.supplier.toLowerCase().includes(query)
      );
    }

    // Apply category filter (if "Category" filter is set)
    if (filters['Category']?.length) {
      result = result.filter((item) =>
        filters['Category'].includes(item.unitType)
      );
    }

    // Apply location filter (if "Location" filter is set)
    if (filters['Location']?.length) {
      result = result.filter((item) =>
        filters['Location'].includes(item.supplier)
      );
    }

    return result;
  }, [searchQuery, filters]);

  const handleRowClick = (id: string) => {
    console.log('Row clicked:', id);
  };

  const handleCreate = () => {
    console.log('Create new item clicked');
  };

  return (
    <main className="w-full bg-white">
      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <Tabs
          value={activeTab}
          onValueChange={setActiveTab}
          className="w-full"
        >
          <TabsList className="bg-transparent border-0 rounded-none h-auto p-0 w-full justify-start">
            <TabsTrigger
              value="materials"
              className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-gray-900 rounded-none font-semibold text-gray-900"
            >
              Materials
            </TabsTrigger>
            <TabsTrigger
              value="equipment"
              className="px-6 py-4 border-b-2 border-transparent data-[state=active]:border-gray-900 rounded-none font-semibold text-gray-500 hover:text-gray-700"
            >
              Equipment
            </TabsTrigger>
          </TabsList>

          <TabsContent value="materials" className="p-6 space-y-6">
            <InventoryToolbar
              onSearch={setSearchQuery}
              onCreate={handleCreate}
              onFilterChange={setFilters}
            />
            <InventoryTable
              data={filteredData}
              onRowClick={handleRowClick}
              onSelectionChange={setSelectedRows}
            />
          </TabsContent>

          <TabsContent value="equipment" className="p-6 space-y-6">
            <InventoryToolbar
              onSearch={setSearchQuery}
              onCreate={handleCreate}
              onFilterChange={setFilters}
            />
            <div className="flex items-center justify-center py-12 text-gray-500">
              <p>Equipment inventory content coming soon.</p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}
