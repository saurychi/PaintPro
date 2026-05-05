"use client"

import React, { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Plus, Archive, RefreshCcw, AlertOctagon } from "lucide-react"
import { supabase } from '@/lib/supabaseClient'

interface InventoryModalProps {
  isOpen: boolean
  onClose: () => void
  type: "materials" | "equipment"
  mode: "add" | "edit" | "view"
  item: any | null
  onSave: (data: any, mode: "add" | "edit", type: "materials" | "equipment") => void
  onArchive: (id: string, type: "materials" | "equipment", isArchiving: boolean) => void
  tags: any[]
  suppliers: any[]
  locations: any[]
  refreshData: () => void
}

const COMMON_UNITS = [
  "Liter (L)", "Gallon (Gal)", "Piece (pc)", "Set", "Meter (m)", 
  "Kilogram (kg)", "Roll", "Tub", "Bucket", "Sheet"
]

export default function InventoryModal({ isOpen, onClose, type, mode, item, onSave, onArchive, tags, suppliers, locations, refreshData }: InventoryModalProps) {
  const [formData, setFormData] = useState<any>({})
  const [isEditMode, setIsEditMode] = useState(mode === 'add' || mode === 'edit')
  
  const [showAddTag, setShowAddTag] = useState(false)
  const [showAddSupplier, setShowAddSupplier] = useState(false)
  const [showAddLocation, setShowAddLocation] = useState(false)
  
  const [newTag, setNewTag] = useState({ name: '', color: '#00c065' })
  const [newSupplier, setNewSupplier] = useState({ name: '', color: '#3b82f6' })
  const [newLocation, setNewLocation] = useState({ name: '', address: '' })

  useEffect(() => {
    if (isOpen) {
      if (item && mode !== 'add') {
        setFormData({ ...item })
      } else {
        setFormData({
          status: type === 'materials' ? 'Active' : 'Available', 
          unit: type === 'materials' ? COMMON_UNITS[0] : null
        })
      }
      setIsEditMode(mode === 'add' || mode === 'edit')
      setShowAddTag(false)
      setShowAddSupplier(false)
      setShowAddLocation(false)
    }
  }, [isOpen, item, mode, type])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target
    // Ensure numbers are saved as numbers, not strings, so the SQL trigger processes math correctly
    const parsedValue = (name === 'current_in_stock' || name === 'reorder_point' || name === 'unit_cost') 
                        && value !== '' ? Number(value) : value;

    setFormData((prev: any) => ({ ...prev, [name]: parsedValue }))
  }

  const handleSave = () => {
    if (!formData.name) {
      alert("Name is required.")
      return
    }
    if (type === 'materials' && formData.unit_cost === undefined) {
      alert("Unit Cost is required for materials.")
      return
    }
    // We explicitly prevent the frontend from saving the status for materials 
    // because the SQL trigger handles it automatically based on stock values.
    const payload = { ...formData }
    if (type === 'materials') delete payload.status;
    
    onSave(payload, mode === 'add' ? 'add' : 'edit', type)
  }

  const handleCreateTag = async () => {
    if (!newTag.name.trim()) return
    const { data, error } = await supabase.from('tag').insert([{ tag_name: newTag.name, color: newTag.color }]).select().single()
    if (!error && data) {
      setFormData((prev: any) => ({ ...prev, tag_id: data.tag_id }))
      setShowAddTag(false)
      setNewTag({ name: '', color: '#00c065' })
      refreshData()
    }
  }

  const handleCreateSupplier = async () => {
    if (!newSupplier.name.trim()) return
    const { data, error } = await supabase.from('supplier').insert([{ supplier_name: newSupplier.name, color: newSupplier.color }]).select().single()
    if (!error && data) {
      setFormData((prev: any) => ({ ...prev, supplier_id: data.supplier_id }))
      setShowAddSupplier(false)
      setNewSupplier({ name: '', color: '#3b82f6' })
      refreshData()
    }
  }

  const handleCreateLocation = async () => {
    if (!newLocation.name.trim()) return
    const { data, error } = await supabase.from('location').insert([{ name: newLocation.name, address: newLocation.address }]).select().single()
    if (!error && data) {
      setFormData((prev: any) => ({ ...prev, location_id: data.location_id }))
      setShowAddLocation(false)
      setNewLocation({ name: '', address: '' })
      refreshData()
    }
  }

  const isArchived = formData.status === 'Archived'

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader className="flex flex-row items-center justify-between mt-2">
          <DialogTitle className="text-xl font-semibold pr-4">
            {mode === 'add' ? `Add New ${type === 'materials' ? 'Material' : 'Equipment'}` : formData.name}
          </DialogTitle>
          
          {mode === 'view' && !isEditMode && (
            <div className="flex gap-2 pr-4">
              <button onClick={() => setIsEditMode(true)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50">
                Edit Details
              </button>
              <button 
                onClick={() => onArchive(type === 'materials' ? formData.material_id : formData.equipment_id, type, !isArchived)} 
                className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg border transition-colors ${isArchived ? 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100' : 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100'}`}
              >
                {isArchived ? <RefreshCcw className="w-4 h-4"/> : <Archive className="w-4 h-4"/>}
                {isArchived ? 'Restore Item' : 'Archive Item'}
              </button>
            </div>
          )}
        </DialogHeader>

        <div className="grid grid-cols-2 gap-8 py-4">
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700">Name <span className="text-red-500">*</span></label>
              <Input name="name" value={formData.name || ''} onChange={handleInputChange} disabled={!isEditMode} className="mt-1" />
            </div>

            <div className="grid grid-cols-2 gap-6">
              {type === 'materials' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Unit Cost <span className="text-red-500">*</span></label>
                  <Input type="number" name="unit_cost" value={formData.unit_cost || ''} onChange={handleInputChange} disabled={!isEditMode} className="mt-1" />
                </div>
              )}
              
              {type === 'materials' ? (
                <div>
                  <label className="text-sm font-medium text-gray-700">Re-order Point</label>
                  <Input type="number" name="reorder_point" value={formData.reorder_point || ''} onChange={handleInputChange} disabled={!isEditMode} className="mt-1" />
                </div>
              ) : (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Date Purchased</label>
                  <Input type="date" name="date_purchased" value={formData.date_purchased ? formData.date_purchased.split('T')[0] : ''} onChange={handleInputChange} disabled={!isEditMode} className="mt-1" />
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-6">
              {type === 'materials' && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Unit Type</label>
                  <select 
                    name="unit" 
                    value={formData.unit || ''} 
                    onChange={handleInputChange} 
                    disabled={!isEditMode} 
                    className="w-full mt-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="" disabled>Select Unit</option>
                    {COMMON_UNITS.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}

              {/* Status is completely removed for Materials since the database handles it. Only show for Equipment. */}
              {type === 'equipment' && (
                <div className="col-span-2">
                  <label className="text-sm font-medium text-gray-700">Status</label>
                  <select 
                    name="status" 
                    value={formData.status || 'Available'} 
                    onChange={handleInputChange} 
                    disabled={!isEditMode} 
                    className="w-full mt-1 h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm outline-none focus:ring-1 focus:ring-ring disabled:opacity-50"
                  >
                    <option value="Available">Available</option>
                    <option value="In Use">In Use</option>
                    {isArchived && <option value="Archived" disabled>Archived</option>}
                  </select>
                </div>
              )}
            </div>

            {type === 'materials' && (
              <div className="grid grid-cols-2 gap-6 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                <div>
                  <label className="text-sm font-medium text-gray-700">Quantity In Stock</label>
                  <Input type="number" name="current_in_stock" value={formData.current_in_stock || ''} onChange={handleInputChange} disabled={!isEditMode} className="mt-1 border-gray-300 shadow-sm" />
                </div>
                
                {/* Needed Stock Read Only View */}
                <div>
                  <label className="text-sm font-medium text-gray-700">Needed For Projects</label>
                  <div className={`mt-1 h-9 w-full flex items-center px-3 rounded-md border ${formData.needed_stock > 0 ? 'bg-red-50 border-red-200 text-red-700 font-semibold' : 'bg-gray-100 border-gray-200 text-gray-500'}`}>
                    {formData.needed_stock || 0}
                    {formData.needed_stock > 0 && <AlertOctagon className="w-4 h-4 ml-auto text-red-600 fill-red-200" />}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Updates automatically</p>
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            
            {/* Tag Selection */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">Tag</label>
                {isEditMode && !showAddTag && <button onClick={() => setShowAddTag(true)} className="text-xs text-[#00c065] flex items-center"><Plus className="w-3 h-3 mr-1"/> Add New</button>}
              </div>
              {showAddTag ? (
                <div className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
                  <Input placeholder="New tag name" value={newTag.name} onChange={e => setNewTag((prev: any) => ({...prev, name: e.target.value}))} className="h-8 text-xs" />
                  <input type="color" value={newTag.color} onChange={e => setNewTag((prev: any) => ({...prev, color: e.target.value}))} className="w-8 h-8 rounded cursor-pointer" />
                  <button onClick={handleCreateTag} className="text-xs bg-[#00c065] text-white px-2 py-1 rounded">Save</button>
                  <button onClick={() => setShowAddTag(false)} className="text-xs text-gray-500">Cancel</button>
                </div>
              ) : (
                <select name="tag_id" value={formData.tag_id || ''} onChange={handleInputChange} disabled={!isEditMode} className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none disabled:opacity-50">
                  <option value="">None</option>
                  {tags.map(t => <option key={t.tag_id} value={t.tag_id}>{t.tag_name}</option>)}
                </select>
              )}
            </div>

            {/* Supplier Selection */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">Supplier</label>
                {isEditMode && !showAddSupplier && <button onClick={() => setShowAddSupplier(true)} className="text-xs text-[#00c065] flex items-center"><Plus className="w-3 h-3 mr-1"/> Add New</button>}
              </div>
              {showAddSupplier ? (
                <div className="flex gap-2 items-center bg-gray-50 p-2 rounded border border-gray-200">
                  <Input placeholder="New supplier" value={newSupplier.name} onChange={e => setNewSupplier((prev: any) => ({...prev, name: e.target.value}))} className="h-8 text-xs" />
                  <button onClick={handleCreateSupplier} className="text-xs bg-[#00c065] text-white px-2 py-1 rounded">Save</button>
                  <button onClick={() => setShowAddSupplier(false)} className="text-xs text-gray-500">Cancel</button>
                </div>
              ) : (
                <select name="supplier_id" value={formData.supplier_id || ''} onChange={handleInputChange} disabled={!isEditMode} className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none disabled:opacity-50">
                  <option value="">None</option>
                  {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_id}>{s.supplier_name}</option>)}
                </select>
              )}
            </div>

            {/* Location Selection */}
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-sm font-medium text-gray-700">Storage Location</label>
                {isEditMode && !showAddLocation && <button onClick={() => setShowAddLocation(true)} className="text-xs text-[#00c065] flex items-center"><Plus className="w-3 h-3 mr-1"/> Add New</button>}
              </div>
              {showAddLocation ? (
                <div className="flex flex-col gap-2 bg-gray-50 p-2 rounded border border-gray-200">
                  <Input placeholder="Location Name (e.g. Warehouse A)" value={newLocation.name} onChange={e => setNewLocation((prev: any) => ({...prev, name: e.target.value}))} className="h-8 text-xs" />
                  <div className="flex gap-2">
                    <button onClick={handleCreateLocation} className="text-xs bg-[#00c065] text-white px-2 py-1 rounded w-full">Save Location</button>
                    <button onClick={() => setShowAddLocation(false)} className="text-xs text-gray-500 px-2">Cancel</button>
                  </div>
                </div>
              ) : (
                <select name="location_id" value={formData.location_id || ''} onChange={handleInputChange} disabled={!isEditMode} className="w-full h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm outline-none disabled:opacity-50">
                  <option value="">None</option>
                  {locations.map(l => <option key={l.location_id} value={l.location_id}>{l.name}</option>)}
                </select>
              )}
            </div>

            <div>
              <label className="text-sm font-medium text-gray-700">Additional Notes</label>
              <Textarea name="notes" value={formData.notes || ''} onChange={handleInputChange} disabled={!isEditMode} className="mt-1 resize-none h-20" placeholder="Optional details..." />
            </div>

          </div>
        </div>

        {isEditMode && (
          <div className="flex justify-end gap-3 mt-4 pt-4 border-t border-gray-100">
            <button onClick={() => mode === 'add' ? onClose() : setIsEditMode(false)} className="px-4 py-2 text-sm font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 text-gray-700">
              Cancel
            </button>
            <button onClick={handleSave} className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#00c065] text-white hover:bg-[#00a054]">
              {mode === 'add' ? `Create ${type === 'materials' ? 'Material' : 'Equipment'}` : 'Save Changes'}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}