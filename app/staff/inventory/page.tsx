"use client"

import React, { useEffect, useState } from "react"
import { Filter, Plus, Search } from "lucide-react"
import { supabase } from "@/lib/supabaseClient"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import InventoryTable from "@/components/inventorytable"
import InventoryModal from "@/components/inventory-modal"

// Staff inventory page. Mirrors the admin inventory page's full CRUD
// capabilities for materials/equipment (add, edit, archive, quick-add
// deficit resolution) — but intentionally OMITS the suppliers / tags /
// locations reference-data manager buttons, which stay admin-only.
// Items reference these dropdowns from the existing options; creating
// new suppliers/tags/locations is restricted to admins.

const ACCENT = "#00c065"

type InventoryRow = Record<string, any>

export default function StaffInventory() {
  const [activeTab, setActiveTab] = useState<"materials" | "equipment">("materials")
  const [materials, setMaterials] = useState<InventoryRow[]>([])
  const [equipment, setEquipment] = useState<InventoryRow[]>([])

  const [tags, setTags] = useState<InventoryRow[]>([])
  const [suppliers, setSuppliers] = useState<InventoryRow[]>([])
  const [locations, setLocations] = useState<InventoryRow[]>([])

  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")

  const [locationFilter, setLocationFilter] = useState<string>("All")
  const [tagFilter, setTagFilter] = useState<string>("All")
  const [supplierFilter, setSupplierFilter] = useState<string>("All")
  const [statusFilter, setStatusFilter] = useState<string>("All")
  const [alertFilter, setAlertFilter] = useState<string>("All")
  const [showArchived, setShowArchived] = useState(false)

  const [modalConfig, setModalConfig] = useState<{
    isOpen: boolean
    mode: "add" | "edit" | "view"
    item: any
  }>({ isOpen: false, mode: "view", item: null })

  const [quickAddModal, setQuickAddModal] = useState<{
    isOpen: boolean
    item: any
    amount: number
  }>({ isOpen: false, item: null, amount: 0 })

  const fetchInventory = async () => {
    setIsLoading(true)

    const [tagRes, supRes, locRes] = await Promise.all([
      supabase.from("tag").select("*").order("tag_name"),
      supabase.from("supplier").select("*").order("supplier_name"),
      supabase.from("location").select("*").order("name"),
    ])

    if (tagRes.data) setTags(tagRes.data)
    if (supRes.data) setSuppliers(supRes.data)
    if (locRes.data) setLocations(locRes.data)

    const [matRes, eqRes] = await Promise.all([
      supabase
        .from("materials")
        .select("*, tag(tag_name, color), supplier(supplier_name, color), location(name)"),
      supabase
        .from("equipment")
        .select("*, tag(tag_name, color), supplier(supplier_name, color), location(name)"),
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
        const aDeficit = Number(a.needed_stock ?? 0)
        const bDeficit = Number(b.needed_stock ?? 0)
        if (bDeficit !== aDeficit) return bDeficit - aDeficit
        return a.name.localeCompare(b.name)
      })
      setMaterials(sortedMats)
    }
    if (eqRes.data) {
      const sortedEq = eqRes.data.sort((a, b) => a.name.localeCompare(b.name))
      setEquipment(sortedEq)
    }

    setIsLoading(false)
  }

  useEffect(() => {
    fetchInventory()
  }, [])

  // Realtime: refetch whenever anyone (admin, manager, another staff)
  // adds/edits/archives a material or equipment row, or touches the
  // reference dropdowns (tag/supplier/location). Requires the matching
  // tables to be in the supabase_realtime publication —
  // see sql/enable_realtime_inventory.sql.
  useEffect(() => {
    const channel = supabase
      .channel("staff-inventory-watcher")
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

  // Inventory writes go through server endpoints (not direct supabase
  // client calls) because staff RLS on materials/equipment typically
  // blocks UPDATE/INSERT. The /api/inventory/* routes role-check the
  // caller and write with the service-role client so admin + manager +
  // staff can all use the same flow.
  const handleSaveItem = async (
    data: any,
    mode: "add" | "edit",
    type: "materials" | "equipment",
  ) => {
    try {
      const res = await fetch("/api/inventory/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode, type, data }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          [body?.error, body?.details].filter(Boolean).join(" — ") ||
            "Failed to save item.",
        )
      }
      setModalConfig({ isOpen: false, mode: "view", item: null })
      fetchInventory()
      window.dispatchEvent(new CustomEvent("materials:changed"))
    } catch (error) {
      console.error("Error saving inventory item:", error)
      alert(error instanceof Error ? error.message : "Failed to save item.")
    }
  }

  const handleQuickAddResolve = async () => {
    if (!quickAddModal.item || quickAddModal.amount <= 0) return

    try {
      const res = await fetch("/api/inventory/quick-add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          materialId: quickAddModal.item.material_id,
          amount: Number(quickAddModal.amount),
        }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          [body?.error, body?.details].filter(Boolean).join(" — ") ||
            "Failed to update stock.",
        )
      }
      setQuickAddModal({ isOpen: false, item: null, amount: 0 })
      fetchInventory()
      window.dispatchEvent(new CustomEvent("materials:changed"))
    } catch (error) {
      console.error("Error resolving deficit:", error)
      alert(error instanceof Error ? error.message : "Failed to update stock.")
    }
  }

  const handleArchiveItem = async (
    id: string,
    type: "materials" | "equipment",
    isArchiving: boolean,
  ) => {
    try {
      const res = await fetch("/api/inventory/archive", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, type, isArchiving }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok) {
        throw new Error(
          [body?.error, body?.details].filter(Boolean).join(" — ") ||
            `Failed to ${isArchiving ? "archive" : "restore"} item.`,
        )
      }
      setModalConfig({ isOpen: false, mode: "view", item: null })
      fetchInventory()
      window.dispatchEvent(new CustomEvent("materials:changed"))
    } catch (error) {
      console.error("Error updating item status:", error)
      alert(
        error instanceof Error
          ? error.message
          : `Failed to ${isArchiving ? "archive" : "restore"} item.`,
      )
    }
  }

  const applyFilters = (items: any[], type: "materials" | "equipment") => {
    return items.filter((item) => {
      const matchesSearch = item.name?.toLowerCase().includes(searchQuery.toLowerCase())

      const isItemArchived = item.status === "Archived"
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
          matchesAlert = neededStock > 0
        } else if (alertFilter === "Reaching") {
          matchesAlert =
            stock <= reorderPoint + 1 && stock >= reorderPoint && neededStock === 0
        } else if (alertFilter === "Below") {
          matchesAlert = stock < reorderPoint && neededStock === 0
        }
      }

      return (
        matchesSearch &&
        matchesLocation &&
        matchesTag &&
        matchesSupplier &&
        matchesStatus &&
        matchesAlert
      )
    })
  }

  const hasActiveFilters =
    locationFilter !== "All" ||
    tagFilter !== "All" ||
    supplierFilter !== "All" ||
    statusFilter !== "All" ||
    alertFilter !== "All"

  return (
    <div className="flex h-[calc(100vh-var(--admin-header-offset,0px))] flex-col overflow-hidden p-4">
      <div className="flex shrink-0 items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-900">Inventory</h1>
        <div className="flex items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs font-medium text-gray-700">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300 text-[#00c065] focus:ring-[#00c065]"
            />
            Show Archived
          </label>
          <button
            onClick={() => setModalConfig({ isOpen: true, mode: "add", item: null })}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:opacity-90 hover:shadow-md active:translate-y-0 active:scale-[0.97]"
            style={{ backgroundColor: ACCENT }}
          >
            <Plus className="h-3.5 w-3.5" /> Add Item
          </button>
        </div>
      </div>

      <div className="mt-4 flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Tabs
          defaultValue="materials"
          onValueChange={(val) => {
            setActiveTab(val as "materials" | "equipment")
            setSearchQuery("")
            setStatusFilter("All")
            setAlertFilter("All")
          }}
          className="flex h-full flex-1 flex-col"
        >
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 p-3">
            <TabsList className="h-8 bg-gray-100">
              <TabsTrigger
                value="materials"
                className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Materials
              </TabsTrigger>
              <TabsTrigger
                value="equipment"
                className="text-xs data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                Equipment
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder={`Search ${activeTab}...`}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 w-56 rounded-md border border-gray-200 pl-8 pr-3 text-xs outline-none transition-all focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]"
                />
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-2.5 text-xs font-semibold text-gray-700 shadow-sm outline-none transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-md active:translate-y-0 active:scale-[0.97] focus:outline-none focus:ring-0">
                    <Filter className="h-3.5 w-3.5" /> Filters
                    {hasActiveFilters && (
                      <span className="flex h-1.5 w-1.5 rounded-full bg-[#00c065]" />
                    )}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="max-h-[70vh] w-56 overflow-y-auto">
                  <div className="px-2 py-1.5 text-xs font-semibold uppercase text-gray-500">
                    Status
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={statusFilter === "All"}
                    onCheckedChange={() => setStatusFilter("All")}
                  >
                    All Statuses
                  </DropdownMenuCheckboxItem>
                  {activeTab === "materials" ? (
                    <DropdownMenuCheckboxItem
                      checked={statusFilter === "Active"}
                      onCheckedChange={() => setStatusFilter("Active")}
                    >
                      Active
                    </DropdownMenuCheckboxItem>
                  ) : (
                    <>
                      <DropdownMenuCheckboxItem
                        checked={statusFilter === "Available"}
                        onCheckedChange={() => setStatusFilter("Available")}
                      >
                        Available
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={statusFilter === "In Use"}
                        onCheckedChange={() => setStatusFilter("In Use")}
                      >
                        In Use
                      </DropdownMenuCheckboxItem>
                    </>
                  )}
                  {showArchived && (
                    <DropdownMenuCheckboxItem
                      checked={statusFilter === "Archived"}
                      onCheckedChange={() => setStatusFilter("Archived")}
                    >
                      Archived
                    </DropdownMenuCheckboxItem>
                  )}

                  <div className="my-1 h-px bg-gray-100" />

                  {activeTab === "materials" && (
                    <>
                      <div className="px-2 py-1.5 text-xs font-semibold uppercase text-gray-500">
                        Inventory Alerts
                      </div>
                      <DropdownMenuCheckboxItem
                        checked={alertFilter === "All"}
                        onCheckedChange={() => setAlertFilter("All")}
                      >
                        All Items
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={alertFilter === "Deficit"}
                        onCheckedChange={() => setAlertFilter("Deficit")}
                      >
                        Project Deficit (Needed)
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={alertFilter === "Reaching"}
                        onCheckedChange={() => setAlertFilter("Reaching")}
                      >
                        Reaching Re-Order Point
                      </DropdownMenuCheckboxItem>
                      <DropdownMenuCheckboxItem
                        checked={alertFilter === "Below"}
                        onCheckedChange={() => setAlertFilter("Below")}
                      >
                        Below Re-Order Point
                      </DropdownMenuCheckboxItem>
                      <div className="my-1 h-px bg-gray-100" />
                    </>
                  )}

                  <div className="px-2 py-1.5 text-xs font-semibold uppercase text-gray-500">
                    Location
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={locationFilter === "All"}
                    onCheckedChange={() => setLocationFilter("All")}
                  >
                    All Locations
                  </DropdownMenuCheckboxItem>
                  {locations.map((loc) => (
                    <DropdownMenuCheckboxItem
                      key={loc.location_id}
                      checked={locationFilter === loc.location_id}
                      onCheckedChange={() => setLocationFilter(loc.location_id)}
                    >
                      {loc.name}
                    </DropdownMenuCheckboxItem>
                  ))}

                  <div className="my-1 h-px bg-gray-100" />

                  <div className="px-2 py-1.5 text-xs font-semibold uppercase text-gray-500">
                    Tag
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={tagFilter === "All"}
                    onCheckedChange={() => setTagFilter("All")}
                  >
                    All Tags
                  </DropdownMenuCheckboxItem>
                  {tags.map((t) => (
                    <DropdownMenuCheckboxItem
                      key={t.tag_id}
                      checked={tagFilter === t.tag_id}
                      onCheckedChange={() => setTagFilter(t.tag_id)}
                    >
                      {t.tag_name}
                    </DropdownMenuCheckboxItem>
                  ))}

                  <div className="my-1 h-px bg-gray-100" />

                  <div className="px-2 py-1.5 text-xs font-semibold uppercase text-gray-500">
                    Supplier
                  </div>
                  <DropdownMenuCheckboxItem
                    checked={supplierFilter === "All"}
                    onCheckedChange={() => setSupplierFilter("All")}
                  >
                    All Suppliers
                  </DropdownMenuCheckboxItem>
                  {suppliers.map((s) => (
                    <DropdownMenuCheckboxItem
                      key={s.supplier_id}
                      checked={supplierFilter === s.supplier_id}
                      onCheckedChange={() => setSupplierFilter(s.supplier_id)}
                    >
                      {s.supplier_name}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-hidden bg-gray-50/50 p-3">
            <TabsContent
              value="materials"
              className="m-0 h-full flex-col data-[state=active]:flex"
            >
              <InventoryTable
                data={applyFilters(materials, "materials")}
                type="materials"
                isLoading={isLoading}
                onRowClick={(item: any) =>
                  setModalConfig({ isOpen: true, mode: "view", item })
                }
                onQuickAdd={(item: any) =>
                  setQuickAddModal({
                    isOpen: true,
                    item,
                    amount: item.needed_stock || 0,
                  })
                }
              />
            </TabsContent>
            <TabsContent
              value="equipment"
              className="m-0 h-full flex-col data-[state=active]:flex"
            >
              <InventoryTable
                data={applyFilters(equipment, "equipment")}
                type="equipment"
                isLoading={isLoading}
                onRowClick={(item: any) =>
                  setModalConfig({ isOpen: true, mode: "view", item })
                }
              />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      {modalConfig.isOpen && (
        <InventoryModal
          isOpen={modalConfig.isOpen}
          onClose={() => setModalConfig({ isOpen: false, mode: "view", item: null })}
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

      <Dialog
        open={quickAddModal.isOpen}
        onOpenChange={() => setQuickAddModal({ isOpen: false, item: null, amount: 0 })}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Resolve Material Deficit</DialogTitle>
            <DialogDescription>
              Add newly purchased stock to clear the project deficit warning.
            </DialogDescription>
          </DialogHeader>
          {quickAddModal.item && (
            <div className="space-y-4 py-4">
              <div className="rounded-md border border-red-100 bg-red-50 p-3 text-sm text-red-800">
                <strong>{quickAddModal.item.name}</strong> currently has a deficit of{" "}
                <strong>{quickAddModal.item.needed_stock} units</strong> required for upcoming
                projects.
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700">Units to Add to Stock</label>
                <div className="mt-1 flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={quickAddModal.amount || ""}
                    onChange={(e) =>
                      setQuickAddModal((prev) => ({ ...prev, amount: Number(e.target.value) }))
                    }
                  />
                  <span className="whitespace-nowrap text-sm text-gray-500">
                    {quickAddModal.item.unit}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => setQuickAddModal({ isOpen: false, item: null, amount: 0 })}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleQuickAddResolve}
                  className="rounded-lg bg-[#00c065] px-4 py-2 text-sm font-semibold text-white hover:bg-[#00a054]"
                >
                  Restock & Resolve
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
