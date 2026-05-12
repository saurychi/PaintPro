"use client"

import React, { useState, useEffect } from "react"
import { supabase } from '@/lib/supabaseClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Filter, MapPin, Tag as TagIcon, Truck } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuCheckboxItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import InventoryTable from '@/components/inventorytable'
import InventoryModal from '@/components/inventory-modal'
import InventoryReferenceModal from '@/components/inventory-reference-modal'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"

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
  const [alertFilter, setAlertFilter] = useState<string>("All")
  const [showArchived, setShowArchived] = useState(false)

  const [modalConfig, setModalConfig] = useState<{isOpen: boolean, mode: 'add'|'edit'|'view', item: any}>({isOpen: false, mode: 'view', item: null})

  // Quick Add Deficit State
  const [quickAddModal, setQuickAddModal] = useState<{isOpen: boolean, item: any, amount: number}>({isOpen: false, item: null, amount: 0})

  // Which reference-data manager modal is open (suppliers / tags / locations).
  // `null` means none. The same modal component handles all three by reading
  // the type prop, so the page only needs to track the current selection.
  const [referenceModal, setReferenceModal] = useState<"supplier" | "tag" | "location" | null>(null)

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
      supabase.from('materials').select('*, tag(tag_name, color), supplier(supplier_name, color), location(name)'),
      supabase.from('equipment').select('*, tag(tag_name, color), supplier(supplier_name, color), location(name)')
    ])

    if (matRes.data) {
      const sortedMats = matRes.data.sort((a, b) => {
        const needsReorder = (item: typeof a) => {
          const stock = Number(item.current_in_stock ?? 0)
          const reorderPoint = Number(item.reorder_point ?? 0)
          const needed = Number(item.needed_stock ?? 0)
          return (reorderPoint > 0 && stock < reorderPoint) || needed > 0
        }
        const aNeedsReorder = needsReorder(a)
        const bNeedsReorder = needsReorder(b)
        if (aNeedsReorder !== bNeedsReorder) return aNeedsReorder ? -1 : 1
        // Among items that need reorder, sort by deficit magnitude descending
        const aDeficit = Number(a.needed_stock ?? 0)
        const bDeficit = Number(b.needed_stock ?? 0)
        if (bDeficit !== aDeficit) return bDeficit - aDeficit
        return a.name.localeCompare(b.name)
      })
      setMaterials(sortedMats)
    }
    if (eqRes.data) {
      const sortedEq = eqRes.data.sort((a, b) => a.name.localeCompare(b.name));
      setEquipment(sortedEq)
    }

    setIsLoading(false)
  }

  useEffect(() => { fetchInventory() }, [])

  // Realtime: listen for changes on the materials, equipment, and
  // reference-data tables (tag/supplier/location) and refetch so the
  // table and dropdowns reflect updates from other tabs/users without
  // a manual reload. Requires the relevant tables to be in the
  // supabase_realtime publication — see sql/enable_realtime_inventory.sql.
  useEffect(() => {
    const channel = supabase
      .channel("admin-inventory-watcher")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "materials" },
        () => fetchInventory(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "equipment" },
        () => fetchInventory(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tag" },
        () => fetchInventory(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "supplier" },
        () => fetchInventory(),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "location" },
        () => fetchInventory(),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaveItem = async (data: any, mode: 'add' | 'edit', type: 'materials' | 'equipment') => {
    const table = type === 'materials' ? 'materials' : 'equipment'
    const idField = type === 'materials' ? 'material_id' : 'equipment_id'

    const payload = { ...data }
    // Strip joined-row objects (they come back from the SELECT with
    // joined tag/supplier/location so the modal can label them, but
    // Supabase rejects them on insert because they aren't real columns).
    delete payload.tag
    delete payload.supplier
    delete payload.location

    if (payload.tag_id === "") payload.tag_id = null;
    if (payload.supplier_id === "") payload.supplier_id = null;
    if (payload.location_id === "") payload.location_id = null;

    // The shared InventoryModal renders a "Date Purchased" input on the
    // Equipment tab too, but the `equipment` table doesn't have that
    // column (it lives on `materials` only). Without this strip the
    // insert errors out with 'column equipment.date_purchased does not
    // exist' and the user sees a generic "Failed to save item" toast
    // with no way to tell what's wrong. Drop the field for equipment
    // so the form keeps the UX while the insert remains valid.
    if (type === 'equipment') {
      delete payload.date_purchased
      delete payload.unit_cost
      delete payload.reorder_point
      delete payload.current_in_stock
      delete payload.needed_stock
    }

    try {
      if (mode === 'add') {
        const { error } = await supabase.from(table).insert([payload])
        if (error) throw error
      } else {
        payload.updated_at = new Date().toISOString()
        const { error } = await supabase.from(table).update(payload).eq(idField, payload[idField])
        if (error) throw error
      }
      setModalConfig({ isOpen: false, mode: 'view', item: null })
      fetchInventory()
      window.dispatchEvent(new CustomEvent("materials:changed"))
    } catch (error: unknown) {
      console.error(`Error saving to ${table}:`, error)
      // Surface the Supabase error message directly so the user can tell
      // schema / constraint / permission failures apart instead of always
      // seeing the same opaque "check console" toast.
      const detail =
        error instanceof Error
          ? error.message
          : (error as { message?: string })?.message ?? "Unknown error"
      alert(`Failed to save ${type === 'materials' ? 'material' : 'equipment'}: ${detail}`)
    }
  }

  const handleQuickAddResolve = async () => {
    if (!quickAddModal.item || quickAddModal.amount <= 0) return;

    // Add the input amount to the current stock.
    // The DB trigger we added will automatically reduce needed_stock based on this delta.
    const newStock = (quickAddModal.item.current_in_stock || 0) + Number(quickAddModal.amount);

    try {
      const { error } = await supabase
        .from('materials')
        .update({ current_in_stock: newStock, updated_at: new Date().toISOString() })
        .eq('material_id', quickAddModal.item.material_id)

      if (error) throw error;

      setQuickAddModal({ isOpen: false, item: null, amount: 0 });
      fetchInventory();
      window.dispatchEvent(new CustomEvent("materials:changed"))
    } catch (error) {
      console.error("Error resolving deficit:", error)
      alert("Failed to update stock.");
    }
  }

  const handleArchiveItem = async (id: string, type: 'materials' | 'equipment', isArchiving: boolean) => {
    const table = type === 'materials' ? 'materials' : 'equipment'
    const idField = type === 'materials' ? 'material_id' : 'equipment_id'

    const restoreStatus = type === 'materials' ? 'Active' : 'Available'
    const newStatus = isArchiving ? 'Archived' : restoreStatus

    try {
      const { error } = await supabase.from(table).update({ status: newStatus }).eq(idField, id)
      if (error) throw error

      setModalConfig({ isOpen: false, mode: 'view', item: null })
      fetchInventory()
      window.dispatchEvent(new CustomEvent("materials:changed"))
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

      let matchesAlert = true
      if (type === "materials" && alertFilter !== "All") {
        const stock = item.current_in_stock ?? 0
        const reorderPoint = item.reorder_point ?? 0
        const neededStock = item.needed_stock ?? 0

        if (alertFilter === "Deficit") {
           matchesAlert = neededStock > 0;
        } else if (alertFilter === "Reaching") {
           matchesAlert = stock <= (reorderPoint + 1) && stock >= reorderPoint && neededStock === 0
        } else if (alertFilter === "Below") {
           matchesAlert = stock < reorderPoint && neededStock === 0
        }
      }

      return matchesSearch && matchesLocation && matchesTag && matchesSupplier && matchesStatus && matchesAlert
    })
  }

  const hasActiveFilters = locationFilter !== "All" || tagFilter !== "All" || supplierFilter !== "All" || statusFilter !== "All" || alertFilter !== "All";

  return (
    <div className="p-4 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-xl font-semibold text-gray-900">Inventory Management</h1>
        <div className="flex gap-3 items-center">
          <label className="flex items-center gap-1.5 text-xs font-medium text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded border-gray-300 text-[#00c065] focus:ring-[#00c065] w-3.5 h-3.5"
            />
            Show Archived
          </label>
          <button
            onClick={() => setModalConfig({ isOpen: true, mode: 'add', item: null })}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md active:translate-y-0 active:scale-[0.97]"
            style={{ backgroundColor: ACCENT }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Item
          </button>
        </div>
      </div>

      <div className="mt-4 flex-1 flex flex-col min-h-0 rounded-lg border border-gray-200 bg-white shadow-sm overflow-hidden">
        <Tabs defaultValue="materials" onValueChange={(val) => {
          setActiveTab(val as 'materials' | 'equipment')
          setSearchQuery("")
          setStatusFilter("All")
          setAlertFilter("All")
        }} className="flex-1 flex flex-col h-full">
          <div className="flex items-center justify-between gap-3 p-3 border-b border-gray-200 shrink-0">
            <TabsList className="bg-gray-100 h-8">
              <TabsTrigger value="materials" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">Materials</TabsTrigger>
              <TabsTrigger value="equipment" className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm">Equipment</TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-56 rounded-md border border-gray-200 pl-8 pr-3 text-xs outline-none focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065] transition-all"
                />
              </div>

              {/* Reference data managers — open a modal listing all
                  suppliers / tags / locations with add/edit/delete. The
                  modal is wider than tall (landscape grid). */}
              <button
                type="button"
                onClick={() => setReferenceModal("supplier")}
                title="Manage suppliers"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97]"
              >
                <Truck className="h-3.5 w-3.5" />
                Suppliers
              </button>
              <button
                type="button"
                onClick={() => setReferenceModal("tag")}
                title="Manage tags"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97]"
              >
                <TagIcon className="h-3.5 w-3.5" />
                Tags
              </button>
              <button
                type="button"
                onClick={() => setReferenceModal("location")}
                title="Manage locations"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97]"
              >
                <MapPin className="h-3.5 w-3.5" />
                Locations
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:scale-[0.97] outline-none focus:outline-none focus:ring-0">
                    <Filter className="h-3.5 w-3.5" /> Filters
                    {hasActiveFilters && (
                      <span className="flex h-1.5 w-1.5 rounded-full bg-[#00c065]"></span>
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-[70vh] overflow-y-auto">

                  <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Status</div>
                  <DropdownMenuCheckboxItem checked={statusFilter === "All"} onCheckedChange={() => setStatusFilter("All")}>All Statuses</DropdownMenuCheckboxItem>
                  {activeTab === "materials" ? (
                    <>
                      <DropdownMenuCheckboxItem checked={statusFilter === "Active"} onCheckedChange={() => setStatusFilter("Active")}>Active</DropdownMenuCheckboxItem>
                      {/* Removed the Needs Reorder Status option here */}
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
                      <div className="px-2 py-1.5 text-xs font-semibold text-gray-500 uppercase">Inventory Alerts</div>
                      <DropdownMenuCheckboxItem checked={alertFilter === "All"} onCheckedChange={() => setAlertFilter("All")}>All Items</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={alertFilter === "Deficit"} onCheckedChange={() => setAlertFilter("Deficit")}>Project Deficit (Needed)</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={alertFilter === "Reaching"} onCheckedChange={() => setAlertFilter("Reaching")}>Reaching Re-Order Point</DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem checked={alertFilter === "Below"} onCheckedChange={() => setAlertFilter("Below")}>Below Re-Order Point</DropdownMenuCheckboxItem>
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

          <div className="flex-1 overflow-hidden p-3 bg-gray-50/50">
            <TabsContent value="materials" className="h-full m-0 data-[state=active]:flex flex-col">
              <InventoryTable
                data={applyFilters(materials, "materials")}
                type="materials"
                isLoading={isLoading}
                onRowClick={(item: any) => setModalConfig({ isOpen: true, mode: 'view', item })}
                onQuickAdd={(item: any) => setQuickAddModal({ isOpen: true, item: item, amount: item.needed_stock || 0 })}
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

      {/* Reference-data manager (suppliers / tags / locations). Single
          modal that takes a `type` prop and re-fetches its own list. After
          a save/delete, also refresh the inventory page so dropdowns and
          table joins pick up the change. */}
      <InventoryReferenceModal
        open={referenceModal !== null}
        type={referenceModal ?? "supplier"}
        onClose={() => setReferenceModal(null)}
        onChanged={fetchInventory}
      />

      {/* Quick Add Shortcut Modal */}
      <Dialog open={quickAddModal.isOpen} onOpenChange={() => setQuickAddModal({ isOpen: false, item: null, amount: 0 })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Material Deficit</DialogTitle>
            <DialogDescription>
              Add newly purchased stock to clear the project deficit warning.
            </DialogDescription>
          </DialogHeader>
          {quickAddModal.item && (
            <div className="space-y-4 py-4">
              <div className="p-3 bg-red-50 text-red-800 rounded-md border border-red-100 text-sm">
                <strong>{quickAddModal.item.name}</strong> currently has a deficit of <strong>{quickAddModal.item.needed_stock} units</strong> required for upcoming projects.
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Units to Add to Stock</label>
                <div className="flex items-center gap-2 mt-1">
                  <Input
                    type="number"
                    min={1}
                    value={quickAddModal.amount || ''}
                    onChange={(e) => setQuickAddModal(prev => ({ ...prev, amount: Number(e.target.value) }))}
                  />
                  <span className="text-sm text-gray-500 whitespace-nowrap">{quickAddModal.item.unit}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={() => setQuickAddModal({ isOpen: false, item: null, amount: 0 })} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700">Cancel</button>
                <button onClick={handleQuickAddResolve} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#00c065] text-white hover:bg-[#00a054]">Restock & Resolve</button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  )
}
