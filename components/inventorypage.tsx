'use client';

import { useState, useMemo } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { InventoryToolbar } from './inventorytoolbar';
import { InventoryTable } from './inventorytable';
import { MOCK_MATERIALS } from '@/lib/inventoryitem';

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
