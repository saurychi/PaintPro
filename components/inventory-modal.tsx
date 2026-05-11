"use client"

import React, { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertOctagon,
  Archive,
  Check,
  Loader2,
  MapPin,
  Package,
  RefreshCcw,
  Tag as TagIcon,
  Truck,
  X,
} from "lucide-react"
import { cn } from "@/lib/utils"

interface InventoryModalProps {
  isOpen: boolean
  onClose: () => void
  type: "materials" | "equipment"
  mode: "add" | "edit" | "view"
  item: any | null
  onSave: (
    data: any,
    mode: "add" | "edit",
    type: "materials" | "equipment",
  ) => void | Promise<void>
  onArchive: (id: string, type: "materials" | "equipment", isArchiving: boolean) => void
  tags: any[]
  suppliers: any[]
  locations: any[]
  refreshData: () => void
}

// Shared with formula variable forms via lib/commonUnits.ts. If we
// add a unit here, update the shared constant instead.
const COMMON_UNITS = [
  "Liter (L)",
  "Gallon (Gal)",
  "Piece (pc)",
  "Set",
  "Meter (m)",
  "Kilogram (kg)",
  "Roll",
  "Tub",
  "Bucket",
  "Sheet",
]

const sectionShell =
  "rounded-md border border-gray-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800"

const sectionTitle =
  "flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400"

const fieldLabel =
  "text-[12px] font-semibold text-gray-700 dark:text-slate-300"

const inputBase =
  "mt-1 h-9 rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 shadow-sm outline-none transition placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-[#00c065]/25 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:placeholder:text-slate-400 dark:disabled:bg-slate-800 dark:disabled:text-slate-300"

const selectBase =
  "mt-1 h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-sm text-gray-900 shadow-sm outline-none transition focus-visible:ring-2 focus-visible:ring-[#00c065]/25 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-300"

const btnSecondary =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"

const btnPrimary =
  "inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition hover:bg-[#00a054] active:scale-[0.98]"

const btnDanger =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 shadow-sm transition hover:bg-red-100"

const btnRestore =
  "inline-flex h-8 items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-3 text-xs font-semibold text-blue-700 shadow-sm transition hover:bg-blue-100"

const iconBtn =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:bg-gray-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"

function statusBadgeClasses(status: string | undefined) {
  if (status === "Archived") {
    return "border-gray-300 bg-gray-100 text-gray-700"
  }
  if (status === "In Use") {
    return "border-blue-200 bg-blue-50 text-blue-700"
  }
  if (status === "Needs Reorder") {
    return "border-orange-200 bg-orange-50 text-orange-700"
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700"
}

export default function InventoryModal({
  isOpen,
  onClose,
  type,
  mode,
  item,
  onSave,
  onArchive,
  tags,
  suppliers,
  locations,
}: InventoryModalProps) {
  const [formData, setFormData] = useState<any>({})
  const [isEditMode, setIsEditMode] = useState(mode === "add" || mode === "edit")
  // Local saving state so the Save Changes / Create button shows a
  // spinner for the duration of the parent's onSave promise — even
  // when the parent doesn't expose a `saving` prop.
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (isOpen) {
      if (item && mode !== "add") {
        setFormData({ ...item })
      } else {
        setFormData({
          status: type === "materials" ? "Active" : "Available",
          unit: type === "materials" ? COMMON_UNITS[0] : null,
        })
      }
      setIsEditMode(mode === "add" || mode === "edit")
      setSaving(false)
    }
  }, [isOpen, item, mode, type])

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
    const { name, value } = e.target
    const parsedValue =
      (name === "current_in_stock" || name === "reorder_point" || name === "unit_cost") &&
      value !== ""
        ? Number(value)
        : value

    setFormData((prev: any) => ({ ...prev, [name]: parsedValue }))
  }

  const handleSave = async () => {
    if (saving) return
    if (!formData.name) {
      alert("Name is required.")
      return
    }
    if (type === "materials" && formData.unit_cost === undefined) {
      alert("Unit Cost is required for materials.")
      return
    }
    const payload = { ...formData }
    if (type === "materials") delete payload.status

    try {
      setSaving(true)
      await onSave(payload, mode === "add" ? "add" : "edit", type)
    } finally {
      // Parent typically closes the modal on success (unmounting the
      // component), so this only matters when onSave rejects or the
      // parent leaves the modal open — in either case the button needs
      // to be clickable again.
      setSaving(false)
    }
  }


  const isArchived = formData.status === "Archived"
  const displayStatus =
    type === "materials" ? formData.status ?? "Active" : formData.status ?? "Available"
  const titleText =
    mode === "add"
      ? `Add New ${type === "materials" ? "Material" : "Equipment"}`
      : formData.name || (type === "materials" ? "Material" : "Equipment")
  const subtitleText =
    mode === "add"
      ? `Create a new ${type === "materials" ? "material" : "equipment"} record.`
      : type === "materials"
        ? "Material details and stock levels."
        : "Equipment details and assignment status."

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        showCloseButton={false}
        className="max-h-[92vh] max-w-3xl gap-0 overflow-hidden rounded-md border border-gray-200 p-0 shadow-2xl dark:border-slate-700 sm:max-w-3xl"
      >
        {/* Accent stripe — matches the rest of the app's modal pattern. */}
        <div className="h-1 w-full shrink-0 bg-[#00c065]" />

        {/* Header */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-5 py-3 dark:border-slate-700/70">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <DialogTitle className="truncate text-[15px] font-semibold text-gray-900 dark:text-slate-100">
                {titleText}
              </DialogTitle>
              {mode !== "add" ? (
                <span
                  className={cn(
                    "inline-flex h-5 items-center rounded-full border px-2 text-[10px] font-semibold uppercase tracking-wide",
                    statusBadgeClasses(displayStatus),
                  )}
                >
                  {displayStatus}
                </span>
              ) : null}
            </div>
            <DialogDescription className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-400">
              {subtitleText}
            </DialogDescription>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {mode === "view" && !isEditMode ? (
              <>
                <button type="button" onClick={() => setIsEditMode(true)} className={btnSecondary}>
                  Edit Details
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onArchive(
                      type === "materials" ? formData.material_id : formData.equipment_id,
                      type,
                      !isArchived,
                    )
                  }
                  className={isArchived ? btnRestore : btnDanger}
                >
                  {isArchived ? <RefreshCcw className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />}
                  {isArchived ? "Restore" : "Archive"}
                </button>
              </>
            ) : null}
            <button type="button" onClick={onClose} className={iconBtn} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="grid max-h-[70vh] grid-cols-1 gap-3 overflow-y-auto bg-gray-50 px-5 py-4 lg:grid-cols-2 dark:bg-slate-900/30">
          {/* LEFT: Item details + stock */}
          <div className="space-y-3">
            <div className={sectionShell}>
              <div className={sectionTitle}>
                <Package className="h-3.5 w-3.5" />
                Item Details
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label className={fieldLabel}>
                    Name <span className="text-red-500">*</span>
                  </label>
                  <Input
                    name="name"
                    value={formData.name || ""}
                    onChange={handleInputChange}
                    disabled={!isEditMode}
                    placeholder="e.g. Ceiling paint"
                    className={inputBase}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {type === "materials" ? (
                    <>
                      <div>
                        <label className={fieldLabel}>
                          Unit Cost <span className="text-red-500">*</span>
                        </label>
                        <Input
                          type="number"
                          name="unit_cost"
                          value={formData.unit_cost ?? ""}
                          onChange={handleInputChange}
                          disabled={!isEditMode}
                          placeholder="0"
                          className={inputBase}
                        />
                      </div>
                      <div>
                        <label className={fieldLabel}>Re-order Point</label>
                        <Input
                          type="number"
                          name="reorder_point"
                          value={formData.reorder_point ?? ""}
                          onChange={handleInputChange}
                          disabled={!isEditMode}
                          placeholder="0"
                          className={inputBase}
                        />
                      </div>
                    </>
                  ) : (
                    <div className="col-span-2">
                      <label className={fieldLabel}>Date Purchased</label>
                      <Input
                        type="date"
                        name="date_purchased"
                        value={
                          formData.date_purchased
                            ? formData.date_purchased.split("T")[0]
                            : ""
                        }
                        onChange={handleInputChange}
                        disabled={!isEditMode}
                        className={inputBase}
                      />
                    </div>
                  )}
                </div>

                {type === "materials" ? (
                  <div>
                    <label className={fieldLabel}>Unit Type</label>
                    <select
                      name="unit"
                      value={formData.unit || ""}
                      onChange={handleInputChange}
                      disabled={!isEditMode}
                      className={selectBase}
                    >
                      <option value="" disabled>
                        Select unit
                      </option>
                      {COMMON_UNITS.map((u) => (
                        <option key={u} value={u}>
                          {u}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className={fieldLabel}>Status</label>
                    <select
                      name="status"
                      value={formData.status || "Available"}
                      onChange={handleInputChange}
                      disabled={!isEditMode}
                      className={selectBase}
                    >
                      <option value="Available">Available</option>
                      <option value="In Use">In Use</option>
                      {isArchived && (
                        <option value="Archived" disabled>
                          Archived
                        </option>
                      )}
                    </select>
                  </div>
                )}
              </div>
            </div>

            {type === "materials" ? (
              <div className={sectionShell}>
                <div className={sectionTitle}>
                  <Package className="h-3.5 w-3.5" />
                  Stock
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <label className={fieldLabel}>Quantity in Stock</label>
                    <Input
                      type="number"
                      name="current_in_stock"
                      value={formData.current_in_stock ?? ""}
                      onChange={handleInputChange}
                      disabled={!isEditMode}
                      placeholder="0"
                      className={inputBase}
                    />
                  </div>

                  <div>
                    <label className={fieldLabel}>Needed for Projects</label>
                    <div
                      className={cn(
                        "mt-1 flex h-9 w-full items-center justify-between rounded-md border px-2.5 text-sm",
                        formData.needed_stock > 0
                          ? "border-red-200 bg-red-50 font-semibold text-red-700"
                          : "border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400",
                      )}
                    >
                      <span>{formData.needed_stock || 0}</span>
                      {formData.needed_stock > 0 ? (
                        <AlertOctagon className="h-3.5 w-3.5 fill-red-200 text-red-600" />
                      ) : null}
                    </div>
                    <p className="mt-1 text-[10px] text-gray-400 dark:text-slate-500">
                      Updates automatically based on active projects.
                    </p>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* RIGHT: Categorization + notes */}
          <div className="space-y-3">
            <div className={sectionShell}>
              <div className={sectionTitle}>
                <TagIcon className="h-3.5 w-3.5" />
                Categorization
              </div>

              <div className="mt-3 space-y-3">
                <div>
                  <label className={fieldLabel}>Tag</label>
                  <select
                    name="tag_id"
                    value={formData.tag_id || ""}
                    onChange={handleInputChange}
                    disabled={!isEditMode}
                    className={selectBase}
                  >
                    <option value="">None</option>
                    {tags.map((t) => (
                      <option key={t.tag_id} value={t.tag_id}>
                        {t.tag_name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={fieldLabel}>Supplier</label>
                  <div className="relative">
                    <Truck className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                    <select
                      name="supplier_id"
                      value={formData.supplier_id || ""}
                      onChange={handleInputChange}
                      disabled={!isEditMode}
                      className={cn(selectBase, "pl-8")}
                    >
                      <option value="">None</option>
                      {suppliers.map((s) => (
                        <option key={s.supplier_id} value={s.supplier_id}>
                          {s.supplier_name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={fieldLabel}>Storage Location</label>
                  <div className="relative">
                    <MapPin className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400 dark:text-slate-500" />
                    <select
                      name="location_id"
                      value={formData.location_id || ""}
                      onChange={handleInputChange}
                      disabled={!isEditMode}
                      className={cn(selectBase, "pl-8")}
                    >
                      <option value="">None</option>
                      {locations.map((l) => (
                        <option key={l.location_id} value={l.location_id}>
                          {l.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className={sectionShell}>
              <div className={sectionTitle}>Notes</div>
              <Textarea
                name="notes"
                value={formData.notes || ""}
                onChange={handleInputChange}
                disabled={!isEditMode}
                className="mt-2 min-h-[88px] resize-none rounded-md border border-gray-200 bg-white px-2.5 py-2 text-sm shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#00c065]/25 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-600 dark:border-slate-600 dark:bg-slate-900/40 dark:text-slate-100 dark:disabled:bg-slate-800 dark:disabled:text-slate-300"
                placeholder="Optional details, color codes, finishing notes…"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        {isEditMode ? (
          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 bg-white px-5 py-3 dark:border-slate-700/70 dark:bg-slate-800">
            <button
              type="button"
              onClick={() => (mode === "add" ? onClose() : setIsEditMode(false))}
              disabled={saving}
              className={cn(
                btnSecondary,
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className={cn(
                btnPrimary,
                "disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {saving ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {saving
                ? mode === "add"
                  ? "Creating..."
                  : "Saving..."
                : mode === "add"
                  ? `Create ${type === "materials" ? "Material" : "Equipment"}`
                  : "Save Changes"}
            </button>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
