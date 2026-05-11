"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Loader2,
  MapPin,
  Pencil,
  Plus,
  Search,
  Tag as TagIcon,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabaseClient";

const ACCENT = "#00c065";

type ReferenceType = "supplier" | "tag" | "location";

type Row = Record<string, any>;

type Props = {
  open: boolean;
  type: ReferenceType;
  onClose: () => void;
  onChanged?: () => void;
};

const TYPE_META: Record<
  ReferenceType,
  {
    table: string;
    idField: string;
    nameField: string;
    title: string;
    singular: string;
    plural: string;
    icon: typeof Truck;
    extraColumns: Array<{ key: string; label: string }>;
  }
> = {
  supplier: {
    table: "supplier",
    idField: "supplier_id",
    nameField: "supplier_name",
    title: "Suppliers",
    singular: "supplier",
    plural: "suppliers",
    icon: Truck,
    extraColumns: [],
  },
  tag: {
    table: "tag",
    idField: "tag_id",
    nameField: "tag_name",
    title: "Tags",
    singular: "tag",
    plural: "tags",
    icon: TagIcon,
    extraColumns: [],
  },
  location: {
    table: "location",
    idField: "location_id",
    nameField: "name",
    title: "Locations",
    singular: "location",
    plural: "locations",
    icon: MapPin,
    extraColumns: [{ key: "address", label: "Address" }],
  },
};

type FormState = {
  mode: "add" | "edit" | null;
  id: string | null;
  name: string;
  color: string;
  address: string;
};

const EMPTY_FORM: FormState = {
  mode: null,
  id: null,
  name: "",
  color: "#00c065",
  address: "",
};

export default function InventoryReferenceModal({
  open,
  type,
  onClose,
  onChanged,
}: Props) {
  const meta = TYPE_META[type];
  const Icon = meta.icon;

  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Reset state every time the modal opens or the type changes, otherwise
  // an Edit form left over from a previous (supplier) session would still
  // be visible when the admin re-opens for (tag) etc.
  useEffect(() => {
    if (!open) return;
    setSearch("");
    setForm(EMPTY_FORM);
    void fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, type]);

  async function fetchRows() {
    setLoading(true);
    const { data, error } = await supabase
      .from(meta.table)
      .select("*")
      .order(meta.nameField, { ascending: true });
    if (error) {
      toast.error(`Failed to load ${meta.plural}.`, {
        description: error.message,
      });
      setLoading(false);
      return;
    }
    setRows(data ?? []);
    setLoading(false);
  }

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row[meta.nameField] ?? "")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search, meta.nameField]);

  function startAdd() {
    setForm({ ...EMPTY_FORM, mode: "add" });
  }

  function startEdit(row: Row) {
    setForm({
      mode: "edit",
      id: String(row[meta.idField]),
      name: String(row[meta.nameField] ?? ""),
      color: String(row.color ?? "#00c065"),
      address: String(row.address ?? ""),
    });
  }

  function cancelForm() {
    setForm(EMPTY_FORM);
  }

  async function handleSave() {
    if (saving) return;
    const name = form.name.trim();
    if (!name) {
      toast.error(`${meta.singular[0].toUpperCase()}${meta.singular.slice(1)} name is required.`);
      return;
    }

    const payload: Record<string, unknown> = {
      [meta.nameField]: name,
      color: form.color || null,
      updated_at: new Date().toISOString(),
    };
    if (type === "location") {
      payload.address = form.address.trim() || null;
    }

    try {
      setSaving(true);
      if (form.mode === "add") {
        const { error } = await supabase.from(meta.table).insert([payload]);
        if (error) throw error;
        toast.success(`Added ${meta.singular}.`);
      } else if (form.mode === "edit" && form.id) {
        const { error } = await supabase
          .from(meta.table)
          .update(payload)
          .eq(meta.idField, form.id);
        if (error) throw error;
        toast.success(`Updated ${meta.singular}.`);
      }
      setForm(EMPTY_FORM);
      await fetchRows();
      onChanged?.();
    } catch (error: any) {
      toast.error(`Failed to save ${meta.singular}.`, {
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: Row) {
    const id = String(row[meta.idField]);
    if (deletingId) return;
    const name = String(row[meta.nameField] ?? meta.singular);
    if (
      !window.confirm(
        `Delete ${meta.singular} "${name}"? Items still referencing it will lose this link.`,
      )
    ) {
      return;
    }
    try {
      setDeletingId(id);
      const { error } = await supabase
        .from(meta.table)
        .delete()
        .eq(meta.idField, id);
      if (error) throw error;
      toast.success(`Deleted ${meta.singular}.`);
      await fetchRows();
      onChanged?.();
    } catch (error: any) {
      toast.error(`Failed to delete ${meta.singular}.`, {
        description: error?.message,
      });
    } finally {
      setDeletingId(null);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4 py-6 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget && !saving && !deletingId) {
          onClose();
        }
      }}
    >
      <div
        className="flex max-h-[88vh] w-full max-w-5xl flex-col overflow-hidden rounded-md border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Green accent strip + faint wash header to match
            DownpaymentModal / Payment Management / etc. */}
        <div className="h-1 w-full shrink-0" style={{ backgroundColor: ACCENT }} aria-hidden />
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-200 px-5 py-3 dark:border-slate-700"
          style={{
            background:
              "linear-gradient(180deg, rgba(0,192,101,0.08) 0%, rgba(0,192,101,0) 100%)",
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-[#00c065] dark:bg-[#00c065]/15 dark:text-emerald-300">
              <Icon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                Manage {meta.title}
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-slate-400">
                {rows.length} {rows.length === 1 ? meta.singular : meta.plural} on file
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={saving || Boolean(deletingId)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:rotate-90 hover:scale-110 hover:bg-gray-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar: search left, Add button right */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-200 px-5 py-3 dark:border-slate-700">
          <div className="relative min-w-0 flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder={`Search ${meta.plural}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-3 text-xs text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
            />
          </div>

          <button
            type="button"
            onClick={startAdd}
            disabled={form.mode === "add"}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
          >
            <Plus className="h-3.5 w-3.5" />
            Add {meta.singular}
          </button>
        </div>

        {/* Inline add/edit form — appears above the list when active. */}
        {form.mode ? (
          <div className="shrink-0 border-b border-gray-200 bg-emerald-50/40 px-5 py-3 dark:border-slate-700 dark:bg-[#00c065]/5">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-[180px] flex-1">
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Name
                </label>
                <input
                  type="text"
                  autoFocus
                  value={form.name}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder={`${meta.singular[0].toUpperCase()}${meta.singular.slice(1)} name`}
                  disabled={saving}
                  className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                />
              </div>

              {type === "location" ? (
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                    Address
                  </label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, address: e.target.value }))
                    }
                    placeholder="Optional"
                    disabled={saving}
                    className="h-8 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-900 outline-none transition focus:border-[#00c065] focus:ring-1 focus:ring-[#00c065]/30 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  />
                </div>
              ) : null}

              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                  Color
                </label>
                <input
                  type="color"
                  value={form.color || "#00c065"}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, color: e.target.value }))
                  }
                  disabled={saving}
                  className="h-8 w-12 cursor-pointer rounded-md border border-gray-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={cancelForm}
                  disabled={saving}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || !form.name.trim()}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md bg-[#00c065] px-3 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-[#00a054] hover:shadow-md active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 disabled:hover:shadow-sm"
                >
                  {saving ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  {saving
                    ? "Saving..."
                    : form.mode === "add"
                      ? `Add ${meta.singular}`
                      : "Save changes"}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {/* List body — landscape grid */}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex h-full min-h-[160px] items-center justify-center text-xs text-gray-500 dark:text-slate-400">
              <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              Loading {meta.plural}...
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 text-center text-xs text-gray-500 dark:text-slate-400">
              <Icon className="h-6 w-6 text-gray-300 dark:text-slate-600" />
              <p>
                {search
                  ? `No ${meta.plural} match "${search}".`
                  : `No ${meta.plural} yet.`}
              </p>
              {!search && !form.mode ? (
                <button
                  type="button"
                  onClick={startAdd}
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-[#00a054] transition-all duration-200 hover:-translate-y-0.5 hover:bg-emerald-100 hover:shadow-sm active:translate-y-0 active:scale-[0.97]"
                >
                  <Plus className="h-3 w-3" />
                  Add the first one
                </button>
              ) : null}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {filteredRows.map((row) => {
                const id = String(row[meta.idField]);
                const name = String(row[meta.nameField] ?? "(unnamed)");
                const color = String(row.color ?? "");
                const address = String(row.address ?? "");
                const isDeleting = deletingId === id;
                return (
                  <div
                    key={id}
                    className="group flex items-center gap-2 rounded-md border border-gray-200 bg-white p-2 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md dark:border-slate-700 dark:bg-slate-900 dark:hover:border-[#00c065]/40"
                  >
                    <span
                      aria-hidden
                      className="h-7 w-7 shrink-0 rounded-md border border-gray-200 dark:border-slate-700"
                      style={{ backgroundColor: color || "#e5e7eb" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold text-gray-900 dark:text-slate-100">
                        {name}
                      </p>
                      {type === "location" && address ? (
                        <p className="truncate text-[10px] text-gray-500 dark:text-slate-400">
                          {address}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100 focus-within:opacity-100">
                      <button
                        type="button"
                        onClick={() => startEdit(row)}
                        disabled={form.mode === "edit" && form.id === id}
                        aria-label={`Edit ${name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:scale-110 hover:border-emerald-200 hover:bg-emerald-50 hover:text-[#00a054] active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(row)}
                        disabled={isDeleting}
                        aria-label={`Delete ${name}`}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-500 transition-all duration-200 hover:-rotate-6 hover:scale-110 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 active:scale-95 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer — plain dismiss row */}
        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-200 px-5 py-3 dark:border-slate-700">
          <button
            type="button"
            onClick={onClose}
            disabled={saving || Boolean(deletingId)}
            className="inline-flex h-8 items-center gap-1.5 rounded-md border border-gray-200 bg-white px-3 text-xs font-semibold text-gray-700 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-50 hover:shadow-sm active:translate-y-0 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-600 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
