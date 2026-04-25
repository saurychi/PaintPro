import React, { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Trash2 } from 'lucide-react'

type InventoryModalProps = {
  isOpen: boolean
  onClose: () => void
  onSave: (data: any, mode: 'add' | 'edit', type: 'materials' | 'equipment') => void
  onDelete: (id: string, type: 'materials' | 'equipment') => void
  item: any | null
  type: 'materials' | 'equipment'
  mode: 'add' | 'edit' | 'view'
  
  tags: any[]
  suppliers: any[]
  uniqueLocations: string[]
  uniqueConditions: string[]
}

export default function InventoryModal({ 
  isOpen, onClose, onSave, onDelete, item, type, mode,
  tags, suppliers, uniqueLocations, uniqueConditions
}: InventoryModalProps) {
  const [formData, setFormData] = useState<any>({})
  const [isEditing, setIsEditing] = useState(mode === 'add')

  useEffect(() => {
    if (item && mode !== 'add') {
      setFormData({
        ...item,
        tag_name: item.tag?.tag_name || '',
        tag_color: item.tag?.color || '#6b7280',
        supplier_name: item.supplier?.supplier_name || '',
        supplier_color: item.supplier?.color || '#d97706',
        date_purchased: item.date_purchased || new Date().toISOString().split('T')[0]
      })
      setIsEditing(mode === 'edit')
    } else {
      setFormData({ 
        name: '', location: '', unit_cost: 0, current_in_stock: 0, reorder_point: 0, unit: '', 
        condition: '', status: 'Available', tag_name: '', tag_color: '#6b7280', 
        supplier_name: '', supplier_color: '#d97706', notes: '',
        date_purchased: new Date().toISOString().split('T')[0] 
      })
      setIsEditing(true)
    }
  }, [item, mode, isOpen])

  const handleChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }))
  }

  const handleTagChange = (val: string) => {
    handleChange('tag_name', val)
    const existing = tags.find(t => t.tag_name.toLowerCase() === val.toLowerCase())
    if (existing && existing.color) handleChange('tag_color', existing.color)
  }

  const handleSupplierChange = (val: string) => {
    handleChange('supplier_name', val)
    const existing = suppliers.find(s => s.supplier_name.toLowerCase() === val.toLowerCase())
    if (existing && existing.color) handleChange('supplier_color', existing.color)
  }

  const handleSubmit = () => {
    onSave(formData, mode === 'add' ? 'add' : 'edit', type)
  }

  const formatDate = (dateStr: string) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-white p-6">
        <DialogHeader>
          <div className="flex justify-between items-center pr-6">
            <DialogTitle className="text-xl">
              {mode === 'add' ? `Add New ${type === 'materials' ? 'Material' : 'Equipment'}` : formData.name}
            </DialogTitle>
            {mode === 'view' && !isEditing && (
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>Edit</Button>
            )}
          </div>
          <DialogDescription className="sr-only">
            View or modify {type} details.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4 max-h-[60vh] overflow-y-auto pr-2 custom-scrollbar">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input disabled={!isEditing} value={formData.name || ''} onChange={e => handleChange('name', e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Unit Cost (₱)</Label>
              <Input type="number" disabled={!isEditing} value={formData.unit_cost || ''} onChange={e => handleChange('unit_cost', parseFloat(e.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>Location</Label>
              <Input disabled={!isEditing} list="locations-list" value={formData.location || ''} onChange={e => handleChange('location', e.target.value)} placeholder="Select or type new..." />
              <datalist id="locations-list">
                {uniqueLocations.map(loc => <option key={loc} value={loc} />)}
              </datalist>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Tag</Label>
              <div className="flex items-center gap-2">
                <Input type="color" disabled={!isEditing} value={formData.tag_color || '#6b7280'} onChange={e => handleChange('tag_color', e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
                <Input disabled={!isEditing} list="tags-list" value={formData.tag_name || ''} onChange={e => handleTagChange(e.target.value)} placeholder="Select or type..." className="flex-1" />
              </div>
              <datalist id="tags-list">
                {tags.map(t => <option key={t.tag_id} value={t.tag_name} />)}
              </datalist>
            </div>
            <div className="space-y-2">
              <Label>Supplier</Label>
              <div className="flex items-center gap-2">
                <Input type="color" disabled={!isEditing} value={formData.supplier_color || '#d97706'} onChange={e => handleChange('supplier_color', e.target.value)} className="w-12 h-10 p-1 cursor-pointer" />
                <Input disabled={!isEditing} list="suppliers-list" value={formData.supplier_name || ''} onChange={e => handleSupplierChange(e.target.value)} placeholder="Select or type..." className="flex-1" />
              </div>
              <datalist id="suppliers-list">
                {suppliers.map(s => <option key={s.supplier_id} value={s.supplier_name} />)}
              </datalist>
            </div>
          </div>

          {type === 'materials' && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Current in Stock</Label>
                  <Input type="number" disabled={!isEditing} value={formData.current_in_stock || 0} onChange={e => handleChange('current_in_stock', parseInt(e.target.value))} />
                </div>
                <div className="space-y-2">
                  <Label>Reorder Point</Label>
                  <Input type="number" disabled={!isEditing} value={formData.reorder_point || 0} onChange={e => handleChange('reorder_point', parseInt(e.target.value))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Unit (e.g. Gallon)</Label>
                  <Input disabled={!isEditing} value={formData.unit || ''} onChange={e => handleChange('unit', e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Date Purchased</Label>
                  <Input type="date" disabled={!isEditing} value={formData.date_purchased || ''} onChange={e => handleChange('date_purchased', e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Additional Notes</Label>
                <Textarea disabled={!isEditing} value={formData.notes || ''} onChange={e => handleChange('notes', e.target.value)} placeholder="Enter additional information..." className="min-h-[80px]" />
              </div>
            </>
          )}

          {type === 'equipment' && (
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Condition</Label>
                <Input disabled={!isEditing} list="conditions-list" value={formData.condition || ''} onChange={e => handleChange('condition', e.target.value)} placeholder="Select or type new..." />
                <datalist id="conditions-list">
                  {uniqueConditions.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <select 
                  disabled={!isEditing} 
                  value={formData.status || 'Available'} 
                  onChange={e => handleChange('status', e.target.value)}
                  className="flex h-10 w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <option value="Available">Available</option>
                  <option value="Not Available">Not Available</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          {mode !== 'add' && item && (
            <div className="flex justify-between text-[11px] font-semibold text-gray-400 mb-4 px-1">
              <span>Created: {formatDate(item.created_at)}</span>
              <span>Updated: {formatDate(item.updated_at)}</span>
            </div>
          )}

          {isEditing && (
            <div className="flex justify-between">
              {mode !== 'add' ? (
                <Button variant="destructive" onClick={() => onDelete(formData.material_id || formData.equipment_id, type)}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              ) : <div />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => mode === 'add' ? onClose() : setIsEditing(false)}>Cancel</Button>
                <Button className="bg-[#00c065] hover:bg-[#00a054] text-white" onClick={handleSubmit}>Save Changes</Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}