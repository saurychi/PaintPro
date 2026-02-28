'use client';

import { useState } from 'react';
import { Search, Filter, Plus, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

type FilterItem = {
  name: string;
  items: string[];
};

export interface InventoryToolbarProps {
  onSearch?: (query: string) => void;
  onCreate?: () => void;
  onFilterChange?: (filters: Record<string, string[]>) => void;
}

export function InventoryToolbar({
  onSearch,
  onCreate,
  onFilterChange,
}: InventoryToolbarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [expandedFilters, setExpandedFilters] = useState<
    Record<string, boolean>
  >({});
  const [selectedFilters, setSelectedFilters] = useState<
    Record<string, string[]>
  >({});

  const filterOptions: FilterItem[] = [
    {
      name: 'Location',
      items: ['Storage Shed A', 'Storage Shed B', 'Storage Shed C', 'Office'],
    },
    {
      name: 'Category',
      items: ['Hardware', 'Textiles', 'Electronics', 'Materials', 'Metals'],
    },
  ];

  const handleSearch = (value: string) => {
    setSearchQuery(value);
    onSearch?.(value);
  };

  const toggleFilterExpand = (filterName: string) => {
    setExpandedFilters((prev) => ({
      ...prev,
      [filterName]: !prev[filterName],
    }));
  };

  const handleFilterSelect = (filterName: string, item: string) => {
    const current = selectedFilters[filterName] || [];
    const updated = current.includes(item)
      ? current.filter((i) => i !== item)
      : [...current, item];

    const newFilters = {
      ...selectedFilters,
      [filterName]: updated.length > 0 ? updated : undefined,
    };

    setSelectedFilters(newFilters);
    onFilterChange?.(
      Object.fromEntries(
        Object.entries(newFilters).filter(([, v]) => v !== undefined)
      )
    );
  };

  return (
    <div className="w-full">
      <div className="flex items-center gap-3 mb-6">
        {/* Search Input */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full px-4 py-2.5 pl-10 bg-white border border-gray-200 rounded-full text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        </div>

        {/* Create Button */}
        <Button
          onClick={onCreate}
          className="bg-green-500 hover:bg-green-600 text-white rounded-full px-4 py-2.5 flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New
        </Button>

        {/* Filters Dropdown */}
        <div className="relative">
          <button
            onClick={() => setIsFilterOpen(!isFilterOpen)}
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <Filter className="w-4 h-4" />
            Filters
          </button>

          {isFilterOpen && (
            <div className="absolute right-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
              {filterOptions.map((filter) => (
                <div key={filter.name} className="border-b last:border-b-0">
                  {/* Filter Header */}
                  <button
                    onClick={() => toggleFilterExpand(filter.name)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    {filter.name}
                    <ChevronRight
                      className={`w-4 h-4 transition-transform ${
                        expandedFilters[filter.name] ? 'rotate-90' : ''
                      }`}
                    />
                  </button>

                  {/* Filter Items */}
                  {expandedFilters[filter.name] && (
                    <div className="bg-gray-50 px-4 py-2">
                      {filter.items.map((item) => (
                        <label
                          key={item}
                          className="flex items-center gap-2 py-2 cursor-pointer text-sm text-gray-600 hover:text-gray-900"
                        >
                          <input
                            type="checkbox"
                            checked={
                              selectedFilters[filter.name]?.includes(item) ||
                              false
                            }
                            onChange={() =>
                              handleFilterSelect(filter.name, item)
                            }
                            className="w-4 h-4 rounded border-gray-300"
                          />
                          {item}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
