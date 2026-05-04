"use client"

import React, { useState, useEffect } from "react"
import { supabase } from '@/lib/supabaseClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Filter } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import InventoryTable from '@/components/inventorytable'
import InventoryModal from '@/components/inventory-modal'

const ACCENT = "#00c065"

export default function AdminInventory() {
  const [activeTab, setActiveTab] = useState<"materials" | "equipment">("materials")
  const [materials, setMaterials] = useState<any[]>([])
  const [equipment, setEquipment] = useState<any[]>([])
  
  const [tags, setTags] = useState<any[]>([])
  const [suppliers, setSuppliers] = useState<any[]>([])
  const [locations, setLocations] = useState<any[]>([])
  
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  const [locationFilter, setLocationFilter] = useState<string>("All")
  const [tagFilter, setTagFilter] = useState<string>("All")
  const [supplierFilter, setSupplierFilter] = useState<string>("All")
  const [statusFilter, setStatusFilter] = useState<string>("All")
  const [reorderFilter, setReorderFilter] = useState<string>("All")
  const [showArchived, setShowArchived] = useState(false)

  const [modalConfig, setModalConfig] = useState<{isOpen: boolean, mode: 'add'|'edit'|'view', item: any}>({isOpen: false, mode: 'view', item: null})

  const fetchInventory = async () => {
    setIsLoading(true)
    
    const [tagRes, supRes, locRes] = await Promise.all([
      supabase.from('tag').select('*').order('tag_name'),
      supabase.from('supplier').select('*').order('supplier_name'),
      supabase.from('location').select('*').order('name')
    ])
    
    if (tagRes.data) setTags(tagRes.data)
    if (supRes.data) setSuppliers(supRes.data)
    if (locRes.data) setLocations(locRes.data)

    const [matRes, eqRes] = await Promise.all([
      supabase.from('materials').select('*, tag(tag_name, color), supplier(supplier_name, color), location(name)').order('name'),
      supabase.from('equipment').select('*, tag(tag_name, color), supplier(supplier_name, color), location(name)').order('name')
    ])
    
    if (matRes.data) setMaterials(matRes.data)
    if (eqRes.data) setEquipment(eqRes.data)
      
    setIsLoading(false)
  }

  useEffect(() => { fetchInventory() }, [])

  const handleSaveItem = async (data: any, mode: 'add' | 'edit', type: 'materials' | 'equipment') => {
    const table = type === 'materials' ? 'materials' : 'equipment'
    const idField = type === 'materials' ? 'material_id' : 'equipment_id'

    const payload = { ...data }
    delete payload.tag
    delete payload.supplier
    delete payload.location

    if (payload.tag_id === "") payload.tag_id = null;
    if (payload.supplier_id === "") payload.supplier_id = null;
    if (payload.location_id === "") payload.location_id = null;

    try {
      if (mode === 'add') {
        const { error } = await supabase.from(table).insert([payload])
        if (error) throw error
      } else {
        payload.updated_at = new Date().toISOString()
        const { error } = await supabase.from(table).update(payload).eq(idField, payload[idField])
        if (error) throw error
      }

      // Reprice the project_task_material rows for any non-finished projects
      // that use this material when its unit_cost actually changed. Locked
      // projects (completed / cancelled) keep their historical cost.
      if (
        mode === 'edit' &&
        type === 'materials' &&
        payload.material_id &&
        previousUnitCost !== null
      ) {
        const newUnitCost = Number(payload.unit_cost ?? 0)
        if (Number.isFinite(newUnitCost) && newUnitCost !== previousUnitCost) {
          await repriceProjectsUsingMaterial(payload.material_id, newUnitCost)
        }
      }

      setModalConfig({ isOpen: false, mode: 'view', item: null })
      fetchInventory()
    } catch (error) {
      console.error(`Error saving to ${table}:`, error)
      alert(`Failed to save item. Check console for details.`)
    }
  }

  const handleArchiveItem = async (id: string, type: 'materials' | 'equipment', isArchiving: boolean) => {
    const table = type === 'materials' ? 'materials' : 'equipment'
    const idField = type === 'materials' ? 'material_id' : 'equipment_id'
    
    // Default restore statuses based on the type
    const restoreStatus = type === 'materials' ? 'Active' : 'Available'
    const newStatus = isArchiving ? 'Archived' : restoreStatus
    
    try {
      const { error } = await supabase.from(table).update({ status: newStatus }).eq(idField, id)
      if (error) throw error
      
      setModalConfig({ isOpen: false, mode: 'view', item: null })
      fetchInventory()
    } catch (error) {
      console.error(`Error updating status in ${table}:`, error)
      alert(`Failed to ${isArchiving ? 'archive' : 'restore'} item.`)
    }
  }

  const applyFilters = (items: any[], type: "materials" | "equipment") => {
    return items.filter(item => {
      const matchesSearch = item.name?.toLowerCase().includes(searchQuery.toLowerCase())
      
      const isItemArchived = item.status === 'Archived'
      if (!showArchived && isItemArchived) return false
      
      const matchesLocation = locationFilter === "All" || item.location_id === locationFilter
      const matchesTag = tagFilter === "All" || item.tag_id === tagFilter
      const matchesSupplier = supplierFilter === "All" || item.supplier_id === supplierFilter
      const matchesStatus = statusFilter === "All" || item.status === statusFilter
      
      let matchesReorder = true
      if (type === "materials" && reorderFilter !== "All") {
        const stock = item.current_in_stock ?? 0
        const reorderPoint = item.reorder_point ?? 0
        
        if (reorderFilter === "Reaching") {
           matchesReorder = stock <= (reorderPoint + 1) && stock >= reorderPoint
        } else if (reorderFilter === "Below") {
           matchesReorder = stock < reorderPoint
        }
      }

      return matchesSearch && matchesLocation && matchesTag && matchesSupplier && matchesStatus && matchesReorder
    })
  }
  
  const hasActiveFilters = locationFilter !== "All" || tagFilter !== "All" || supplierFilter !== "All" || statusFilter !== "All" || reorderFilter !== "All";

  return (
    <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900">Inventory Management</h1>
        <div className="flex gap-4 items-center">
          <label className="flex items-center gap-2 text-sm font-medium text-gray-700 cursor-pointer">
            <input 
              type="checkbox" 
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300 text-[#00c065] focus:ring-[#00c065] w-4 h-4"
            />
            Show Archived
          </label>
          <button 
            onClick={() => setModalConfig({ isOpen: true, mode: 'add', item: null })}
            className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:opacity-90"
            style={{ backgroundColor: ACCENT }}
          >
            <Plus className="h-4 w-4" /> Add Item
          </button>
        </div>
      </div>

      <div className="mt-6 flex-1 flex flex-col min-h-0 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Tabs defaultValue="materials" onValueChange={(val) => {
          setActiveTab(val as 'materials' | 'equipment')
          setSearchQuery("")
          setStatusFilter("All") // Reset status filter on tab change since options are different
        }} className="flex-1 flex flex-col h-full">
          <div className="flex items-center justify-between p-4 border-b border-gray-200 shrink-0">
            <TabsList className="bg-gray-100">
              <TabsTrigger value="materials" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Materials</TabsTrigger>
              <TabsTrigger value="equipment" className="data-[state=active]:bg-white data-[state=active]:shadow-sm">Equipment</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-64 rounded-lg border border-gray-200 pl-9 pr-4 py-2 text-sm outline-none focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065] transition-all"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors outline-none focus:outline-none focus:ring-0">
                    <Filter className="h-4 w-4" /> Filters
                    {hasActiveFilters && (
                      <span className="flex h-2 w-2 rounded-full bg-[#00c065]"></span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">
                  
                  {/* Status Filter */}
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Status</div>
                  <DropdownMenuCheckboxItem checked={statusFilter === "All"} onCheckedChange={() => setStatusFilter("All")}>All Statuses</DropdownMenuCheckboxItem>
                  {activeTab === "materials" ? (
                    <>
                      <DropdownMenuCheckboxItem checked={statusFilter === "Active"} onCheckedChange={() => setStatusFilter("Active")}>Active</DropdownMenuCheckboxItem>
                    </>
                  ) : (
                    <>
                      <DropdownMenuCheckboxItem checked={statusFilter === "Available"} onCheckedChange={() => setStatusFilter("Available")}>Available</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={statusFilter === "In Use"} onCheckedChange={() => setStatusFilter("In Use")}>In Use</DropdownMenuCheckboxItem>
                    </>
                  )}
                  {showArchived && <DropdownMenuCheckboxItem checked={statusFilter === "Archived"} onCheckedChange={() => setStatusFilter("Archived")}>Archived</DropdownMenuCheckboxItem>}

                  <div className="h-px bg-gray-100 my-1"></div>

                  {activeTab === "materials" && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Re-Order Alerts</div>
                      <DropdownMenuCheckboxItem checked={reorderFilter === "All"} onCheckedChange={() => setReorderFilter("All")}>All Items</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={reorderFilter === "Reaching"} onCheckedChange={() => setReorderFilter("Reaching")}>Reaching Re-Order Point</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={reorderFilter === "Below"} onCheckedChange={() => setReorderFilter("Below")}>Below Re-Order Point</DropdownMenuCheckboxItem>
                      <div className="h-px bg-gray-100 my-1"></div>
                    </>
                  )}
                  
                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Location</div>
                  <DropdownMenuCheckboxItem checked={locationFilter === "All"} onCheckedChange={() => setLocationFilter("All")}>All Locations</DropdownMenuCheckboxItem>
                  {locations.map(loc => (
                    <DropdownMenuCheckboxItem key={loc.location_id} checked={locationFilter === loc.location_id} onCheckedChange={() => setLocationFilter(loc.location_id)}>
                      {loc.name}
                    </DropdownMenuCheckboxItem>
                  ))}

                  <div className="h-px bg-gray-100 my-1"></div>

                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Tag</div>
                  <DropdownMenuCheckboxItem checked={tagFilter === "All"} onCheckedChange={() => setTagFilter("All")}>All Tags</DropdownMenuCheckboxItem>
                  {tags.map(t => (
                    <DropdownMenuCheckboxItem key={t.tag_id} checked={tagFilter === t.tag_id} onCheckedChange={() => setTagFilter(t.tag_id)}>
                      {t.tag_name}
                    </DropdownMenuCheckboxItem>
                  ))}

                  <div className="h-px bg-gray-100 my-1"></div>

                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Supplier</div>
                  <DropdownMenuCheckboxItem checked={supplierFilter === "All"} onCheckedChange={() => setSupplierFilter("All")}>All Suppliers</DropdownMenuCheckboxItem>
                  {suppliers.map(s => (
                    <DropdownMenuCheckboxItem key={s.supplier_id} checked={supplierFilter === s.supplier_id} onCheckedChange={() => setSupplierFilter(s.supplier_id)}>
                      {s.supplier_name}
                    </DropdownMenuCheckboxItem>
                  ))}
                  
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4 bg-gray-50/50">
            <TabsContent value="materials" className="h-full m-0 data-[state=active]:flex flex-col">
              <InventoryTable 
                data={applyFilters(materials, "materials")} 
                type="materials" 
                isLoading={isLoading} 
                onRowClick={(item: any) => setModalConfig({ isOpen: true, mode: 'view', item })} 
              />
            </TabsContent>
            <TabsContent value="equipment" className="h-full m-0 data-[state=active]:flex flex-col">
              <InventoryTable 
                data={applyFilters(equipment, "equipment")} 
                type="equipment" 
                isLoading={isLoading} 
                onRowClick={(item: any) => setModalConfig({ isOpen: true, mode: 'view', item })} 
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {modalConfig.isOpen && (
        <InventoryModal
          isOpen={modalConfig.isOpen}
          onClose={() => setModalConfig({ isOpen: false, mode: 'view', item: null })}
          type={activeTab}
          mode={modalConfig.mode}
          item={modalConfig.item}
          onSave={handleSaveItem}
          onArchive={(id, type, isArchiving) => handleArchiveItem(id, type, isArchiving)}
          tags={tags}
          suppliers={suppliers}
          locations={locations}
          refreshData={fetchInventory}
        />
      )}
    </div>
  )
}