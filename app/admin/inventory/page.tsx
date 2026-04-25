"use client"

import React, { useState, useEffect } from "react"
import { supabase } from '@/lib/supabaseClient'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Search, Plus, Filter, Download } from "lucide-react"
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
  
  const [isLoading, setIsLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  
  const [locationFilter, setLocationFilter] = useState<string>("All")
  const [modalConfig, setModalConfig] = useState<{isOpen: boolean, mode: 'add'|'edit'|'view', item: any}>({isOpen: false, mode: 'view', item: null})

  const fetchInventory = async () => {
    setIsLoading(true)
    const [matRes, eqRes, tagRes, supRes] = await Promise.all([
      supabase.from('materials').select('*, tag(tag_name, color), supplier(supplier_name, color)').order('name'),
      supabase.from('equipment').select('*, tag(tag_name, color), supplier(supplier_name, color)').order('name'),
      supabase.from('tag').select('*').order('tag_name'),
      supabase.from('supplier').select('*').order('supplier_name')
    ])
    
    if (matRes.data) setMaterials(matRes.data)
    if (eqRes.data) setEquipment(eqRes.data)
    if (tagRes.data) setTags(tagRes.data)
    if (supRes.data) setSuppliers(supRes.data)
      
    setIsLoading(false)
  }

  useEffect(() => { fetchInventory() }, [])

  const handleExport = () => {
    const dataToExport = activeTab === "materials" ? materials : equipment
    if (dataToExport.length === 0) return

    const headers = Object.keys(dataToExport[0]).filter(k => typeof dataToExport[0][k] !== 'object')
    const csvRows = [
      headers.join(','), 
      ...dataToExport.map(row => headers.map(header => `"${row[header] || ''}"`).join(',')) 
    ]
    
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PaintPro_${activeTab}_export.csv`
    a.click()
  }

  const handleSaveItem = async (data: any, mode: 'add' | 'edit', type: 'materials' | 'equipment') => {
    const table = type === 'materials' ? 'materials' : 'equipment'
    const idField = type === 'materials' ? 'material_id' : 'equipment_id'

    const payload = { ...data }
    delete payload.tag
    delete payload.supplier
    
    const submittedTagName = payload.tag_name; delete payload.tag_name;
    const submittedTagColor = payload.tag_color; delete payload.tag_color;
    const submittedSupplierName = payload.supplier_name; delete payload.supplier_name;
    const submittedSupplierColor = payload.supplier_color; delete payload.supplier_color;

    try {
      if (submittedTagName && submittedTagName.trim() !== '') {
        const existingTag = tags.find(t => t.tag_name.toLowerCase() === submittedTagName.trim().toLowerCase())
        if (existingTag) {
          payload.tag_id = existingTag.tag_id
          if (existingTag.color !== submittedTagColor) {
            await supabase.from('tag').update({ color: submittedTagColor }).eq('tag_id', existingTag.tag_id)
          }
        } else {
          const { data: newTag } = await supabase.from('tag').insert([{ tag_name: submittedTagName.trim(), color: submittedTagColor }]).select().single()
          if (newTag) payload.tag_id = newTag.tag_id
        }
      } else {
        payload.tag_id = null
      }

      if (submittedSupplierName && submittedSupplierName.trim() !== '') {
        const existingSup = suppliers.find(s => s.supplier_name.toLowerCase() === submittedSupplierName.trim().toLowerCase())
        if (existingSup) {
          payload.supplier_id = existingSup.supplier_id
          if (existingSup.color !== submittedSupplierColor) {
            await supabase.from('supplier').update({ color: submittedSupplierColor }).eq('supplier_id', existingSup.supplier_id)
          }
        } else {
          const { data: newSup } = await supabase.from('supplier').insert([{ supplier_name: submittedSupplierName.trim(), color: submittedSupplierColor }]).select().single()
          if (newSup) payload.supplier_id = newSup.supplier_id
        }
      } else {
        payload.supplier_id = null
      }

      // STRICT CLEANUP
      if (type === 'materials') {
        delete payload.condition
        delete payload.status
        delete payload.equipment_id 
      } else if (type === 'equipment') {
        delete payload.current_in_stock
        delete payload.reorder_point
        delete payload.unit
        delete payload.date_purchased
        delete payload.notes
        delete payload.material_id 
      }

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
    } catch (error) {
      console.error(`Error saving to ${table}:`, error)
      alert(`Failed to save item. Check console for details.`)
    }
  }

  const handleDeleteItem = async (id: string, type: 'materials' | 'equipment') => {
    const table = type === 'materials' ? 'materials' : 'equipment'
    const idField = type === 'materials' ? 'material_id' : 'equipment_id'
    
    try {
      const { error } = await supabase.from(table).delete().eq(idField, id)
      if (error) throw error
      
      setModalConfig({ isOpen: false, mode: 'view', item: null })
      fetchInventory()
    } catch (error) {
      console.error(`Error deleting from ${table}:`, error)
      alert("Failed to delete item.")
    }
  }

  const applyFilters = (items: any[]) => {
    return items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase())
      const matchesLocation = locationFilter === "All" || item.location === locationFilter
      return matchesSearch && matchesLocation
    })
  }

  const uniqueLocations = Array.from(new Set([...materials, ...equipment].map(item => item.location).filter(Boolean)))
  const uniqueConditions = Array.from(new Set(equipment.map(item => item.condition).filter(Boolean)))

  return (
    <div className="p-6 h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden flex flex-col">
      <div className="flex items-center justify-between shrink-0">
        <h1 className="text-2xl font-semibold text-gray-900">Inventory Management</h1>
        <div className="flex gap-3">
          <button onClick={handleExport} className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors">
            <Download className="h-4 w-4" /> Export CSV
          </button>
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
        <Tabs defaultValue="materials" onValueChange={(val) => setActiveTab(val as 'materials' | 'equipment')} className="flex-1 flex flex-col h-full">
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

              {/* Updated Filter Button Style */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 transition-colors outline-none focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]">
                    <Filter className="h-4 w-4" /> {locationFilter === "All" ? "Filter Location" : locationFilter}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-48">
                  <DropdownMenuCheckboxItem checked={locationFilter === "All"} onCheckedChange={() => setLocationFilter("All")}>
                    All Locations
                  </DropdownMenuCheckboxItem>
                  {uniqueLocations.map(loc => (
                    <DropdownMenuCheckboxItem key={loc} checked={locationFilter === loc} onCheckedChange={() => setLocationFilter(loc)}>
                      {loc}
                    </DropdownMenuCheckboxItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>

          <div className="flex-1 overflow-hidden p-4 bg-gray-50/50">
            <TabsContent value="materials" className="h-full m-0 data-[state=active]:flex flex-col">
              <InventoryTable data={applyFilters(materials)} type="materials" isLoading={isLoading} onRowClick={(item) => setModalConfig({ isOpen: true, mode: 'view', item })} />
            </TabsContent>
            <TabsContent value="equipment" className="h-full m-0 data-[state=active]:flex flex-col">
              <InventoryTable data={applyFilters(equipment)} type="equipment" isLoading={isLoading} onRowClick={(item) => setModalConfig({ isOpen: true, mode: 'view', item })} />
            </TabsContent>
          </div>
        </Tabs>
      </div>

      <InventoryModal
        isOpen={modalConfig.isOpen}
        onClose={() => setModalConfig({ isOpen: false, mode: 'view', item: null })}
        type={activeTab}
        mode={modalConfig.mode}
        item={modalConfig.item}
        onSave={handleSaveItem}
        onDelete={handleDeleteItem}
        tags={tags}
        suppliers={suppliers}
        uniqueLocations={uniqueLocations}
        uniqueConditions={uniqueConditions}
      />
    </div>
  )
}