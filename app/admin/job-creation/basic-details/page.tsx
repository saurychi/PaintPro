"use client"

import React, { useEffect, useMemo, useRef, useState } from "react"
import {
  Plus,
  Upload,
  ChevronDown,
  ChevronRight,
  X,
  ChevronLeft,
  Trash2,
  MoreVertical,
  Send,
} from "lucide-react"
import { useRouter } from "next/navigation"

const GREEN = "#7ED957"
const GREEN_SOFT = "#DFF6D5"
const SCROLL_TRACK = "#EAF7E4"
const BORDER = "border-gray-200"

type TemplateItem = {
  id: string
  jobNo: string
  siteName: string
}

type PickedImage = {
  id: string
  file: File
  url: string
}

type DimensionRow = {
  id: string
  surface: string
  length: string
  width: string
}

type DimMeasurement = {
  surface: string
  length: string
  width: string
}

type ChatMessage = {
  id: string
  sender: string
  role?: "staff" | "client"
  time?: string
  text: string
  measurements?: DimMeasurement[]
}

type MessageThread = {
  id: string
  name: string
  roleLabel: string
  preview: string
  messages: ChatMessage[]
}

function makeId(prefix: string) {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `${prefix}_${crypto.randomUUID()}`
    : `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

// sample threads (replace later with real data)
const SAMPLE_THREADS: MessageThread[] = [
  {
    id: "t1",
    name: "Marco Dela Cruz",
    roleLabel: "Staff",
    preview: "Here is the dimensions from the place...",
    messages: [
      {
        id: "m1",
        sender: "Marco Dela Cruz",
        role: "staff",
        time: "5min ago",
        text:
          "Here is the dimensions from the place:\n" +
          "• Small bedroom wall (left) = 3 x 2.4 m\n" +
          "• Small bedroom wall (right) = 3 x 2.4 m\n" +
          "• Kitchen wall (east side) = 3.5 x 2.4 m\n" +
          "• Kitchen wall (west side) = 3.5 x 2.4 m",
        measurements: [
          { surface: "Small bedroom wall (left)", length: "3", width: "2.4" },
          { surface: "Small bedroom wall (right)", length: "3", width: "2.4" },
          { surface: "Kitchen wall (east side)", length: "3.5", width: "2.4" },
          { surface: "Kitchen wall (west side)", length: "3.5", width: "2.4" },
        ],
      },
      { id: "m2", sender: "You", time: "1min ago", text: "thank you" },
    ],
  },
  {
    id: "t2",
    name: "Client",
    roleLabel: "Client",
    preview: "The amount of paint needed did not...",
    messages: [
      {
        id: "m1",
        sender: "Client",
        role: "client",
        time: "12min ago",
        text: "The amount of paint needed did not match the initial estimate.",
      },
    ],
  },
  {
    id: "t3",
    name: "Ramon Santos",
    roleLabel: "Staff",
    preview: "sir i have an urgency and i currentl...",
    messages: [
      {
        id: "m1",
        sender: "Ramon Santos",
        role: "staff",
        time: "30min ago",
        text: "sir i have an urgency and i currently...",
      },
    ],
  },
]

export default function BasicDetails() {
  const router = useRouter()

  // put more items so scrollbar is visible
  const templates: TemplateItem[] = useMemo(() => {
    return Array.from({ length: 22 }).map((_, i) => ({
      id: `t${i + 1}`,
      jobNo: "#0000001A-2024",
      siteName: "Dawn House",
    }))
  }, [])

  const [jobId] = useState("#0000001B-2024")
  const [jobName, setJobName] = useState("")
  const [scheduledFinish, setScheduledFinish] = useState("2024-07-20")
  const [address, setAddress] = useState("42 Wellington Street East Perth WA 6004 Australia")
  const [client, setClient] = useState("Samantha Reynolds")
  const [contactInfo, setContactInfo] = useState("09662749655")
  const [description, setDescription] = useState("")

  // ----------------------------
  // Dimensions modal state
  // ----------------------------
  const [isDimensionsOpen, setIsDimensionsOpen] = useState(false)

  // Saved rows (what the user finished)
  const [dimensions, setDimensions] = useState<DimensionRow[]>([])

  // Draft rows (editable inside the modal)
  const [dimDraft, setDimDraft] = useState<DimensionRow[]>([])

  function openDimensionsModal() {
    // If there are saved rows, load them. Otherwise start empty (no default rows).
    setDimDraft(dimensions.length ? dimensions.map((r) => ({ ...r })) : [])
    setIsDimensionsOpen(true)
  }

  function closeDimensionsModal() {
    setIsDimensionsOpen(false)
  }

  function updateDimRow(id: string, patch: Partial<DimensionRow>) {
    setDimDraft((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)))
  }

  function removeDimRow(id: string) {
    setDimDraft((prev) => prev.filter((r) => r.id !== id))
  }

  function addDimRow() {
    setDimDraft((prev) => [...prev, { id: makeId("dim"), surface: "", length: "", width: "" }])
  }

  function finishDimensions() {
    const cleaned = dimDraft
      .map((r) => ({
        ...r,
        surface: r.surface.trim(),
        length: r.length.trim(),
        width: r.width.trim(),
      }))
      .filter((r) => r.surface || r.length || r.width)

    setDimensions(cleaned)
    setIsDimensionsOpen(false)

    // optional: populate description only if empty
    if (cleaned.length) {
      const summary = cleaned
        .map((r) => {
          const lw = [r.length && `L:${r.length}`, r.width && `W:${r.width}`].filter(Boolean).join(" ")
          return lw ? `${r.surface || "Surface"} (${lw})` : `${r.surface || "Surface"}`
        })
        .join(", ")

      setDescription((d) => (d.trim() ? d : summary))
    }
  }

  const dimensionsSummary = useMemo(() => {
    if (!dimensions.length) return "No Dimensions Added"
    const names = dimensions
      .map((d) => d.surface)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ")
    const more = dimensions.length > 4 ? `, +${dimensions.length - 4} more` : ""
    return `${names}${more}`
  }, [dimensions])

  // ----------------------------
  // Messages + Chat modal state
  // ----------------------------
  const [threads] = useState<MessageThread[]>(SAMPLE_THREADS)
  const [isChatOpen, setIsChatOpen] = useState(false)
  const [activeThread, setActiveThread] = useState<MessageThread | null>(null)
  const [menuMsgId, setMenuMsgId] = useState<string | null>(null)
  const [chatDraft, setChatDraft] = useState("")

  function openThread(thread: MessageThread) {
    setActiveThread(thread)
    setMenuMsgId(null)
    setIsChatOpen(true)
  }

  function closeThread() {
    setIsChatOpen(false)
    setMenuMsgId(null)
  }

  function applyMeasurements(measurements: DimMeasurement[]) {
    const nextRows: DimensionRow[] = measurements.map((m) => ({
      id: makeId("dim"),
      surface: m.surface,
      length: m.length,
      width: m.width,
    }))
    setDimDraft(nextRows)
    setMenuMsgId(null)
    setIsChatOpen(false) // close chat after applying
  }

  // ----------------------------
  // Image Analyze Modal state
  // ----------------------------
  const [isAnalyzeOpen, setIsAnalyzeOpen] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // user adds images one-by-one and can remove them
  const [pickedImages, setPickedImages] = useState<PickedImage[]>([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [modalNotes, setModalNotes] = useState("")

  function openAnalyzeModal() {
    setActiveIndex((i) => {
      if (!pickedImages.length) return 0
      return Math.min(i, pickedImages.length - 1)
    })
    setIsAnalyzeOpen(true)
  }

  function closeAnalyzeModal() {
    setIsAnalyzeOpen(false)
  }

  function triggerFilePicker() {
    fileInputRef.current?.click()
  }

  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const id = makeId("img")
    const url = URL.createObjectURL(file)

    setPickedImages((prev) => {
      const next = [...prev, { id, file, url }]
      setActiveIndex(next.length - 1)
      return next
    })

    // allow picking same file again
    e.target.value = ""
  }

  function removeImage(id: string) {
    setPickedImages((prev) => {
      const idx = prev.findIndex((p) => p.id === id)
      if (idx === -1) return prev

      try {
        URL.revokeObjectURL(prev[idx].url)
      } catch {}

      const next = prev.filter((p) => p.id !== id)

      setActiveIndex((current) => {
        if (!next.length) return 0
        if (current > next.length - 1) return next.length - 1
        if (idx < current) return current - 1
        return Math.min(current, next.length - 1)
      })

      return next
    })
  }

  function deleteActiveImage() {
    if (!pickedImages.length) return
    const current = pickedImages[activeIndex]
    if (!current) return
    removeImage(current.id)
  }

  function clearAllImages() {
    setPickedImages((prev) => {
      prev.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url)
        } catch {}
      })
      return []
    })
    setActiveIndex(0)
  }

  // close on ESC + arrow navigation inside analyze modal
  useEffect(() => {
    if (!isAnalyzeOpen) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeAnalyzeModal()
      if (ev.key === "ArrowLeft") setActiveIndex((i) => Math.max(0, i - 1))
      if (ev.key === "ArrowRight") setActiveIndex((i) => Math.min(pickedImages.length - 1, i + 1))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isAnalyzeOpen, pickedImages.length])

  // ESC close for Dimensions modal too
  useEffect(() => {
    if (!isDimensionsOpen) return
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === "Escape") closeDimensionsModal()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [isDimensionsOpen])

  function goPrev() {
    setActiveIndex((i) => Math.max(0, i - 1))
  }

  function goNext() {
    setActiveIndex((i) => Math.min(pickedImages.length - 1, i + 1))
  }

  function onAnalyze() {
    console.log("Analyze images:", pickedImages.map((p) => p.file))
    console.log("Notes:", modalNotes)
    closeAnalyzeModal()
  }

  // cleanup on unmount
  useEffect(() => {
    return () => {
      pickedImages.forEach((p) => {
        try {
          URL.revokeObjectURL(p.url)
        } catch {}
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="h-[calc(100vh-0px)] w-full">
      <div className="flex h-full w-full flex-col px-6 py-5">
        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <div className="text-xl font-semibold text-gray-900">Job</div>
          <ChevronRight className="h-5 w-5 text-gray-300" aria-hidden />
          <div className="text-xl font-semibold text-gray-900">Job Creation</div>
        </div>

        {/* Content */}
        <div className="grid flex-1 min-h-0 grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          {/* LEFT */}
          <section className={`min-h-0 rounded-2xl border ${BORDER} bg-white shadow-sm flex flex-col`}>
            <div className="px-5 pt-4">
              <h1 className="text-lg font-semibold text-gray-900">Job</h1>
            </div>

            <div className="flex-1 min-h-0 px-5 pt-3 pb-4">
              <div
                className={[
                  "h-full min-h-0 overflow-y-auto pr-2",
                  "[&::-webkit-scrollbar]:w-2",
                  "[&::-webkit-scrollbar-track]:rounded-full",
                  "[&::-webkit-scrollbar-track]:bg-[#EAF7E4]",
                  "[&::-webkit-scrollbar-thumb]:rounded-full",
                  "[&::-webkit-scrollbar-thumb]:bg-[#7ED957]",
                ].join(" ")}
                style={{ scrollbarWidth: "thin", scrollbarColor: `${GREEN} ${SCROLL_TRACK}` }}
              >
                {/* Row 1 */}
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-12">
                  <div className="min-w-0 lg:col-span-3">
                    <label className="text-[11px] font-medium text-gray-600">ID Number</label>
                    <input
                      value={jobId}
                      readOnly
                      className={`mt-2 w-full rounded-md border ${BORDER} bg-gray-50 px-3 py-2 text-sm text-gray-800`}
                    />
                  </div>

                  <div className="min-w-0 lg:col-span-6">
                    <label className="text-[11px] font-medium text-gray-600">Job/Project Name</label>
                    <input
                      value={jobName}
                      onChange={(e) => setJobName(e.target.value)}
                      placeholder="Enter Job/Project Name"
                      className={`mt-2 w-full rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
                      style={{ ["--tw-ring-color" as any]: GREEN }}
                    />
                  </div>

                  <div className="min-w-0 lg:col-span-3">
                    <label className="text-[11px] font-medium text-gray-600">Scheduled Finishing Date</label>
                    <div className="relative mt-2">
                      <input
                        type="date"
                        value={scheduledFinish}
                        onChange={(e) => setScheduledFinish(e.target.value)}
                        className={`w-full rounded-md border ${BORDER} bg-white px-3 py-2 pr-10 text-sm text-gray-900 outline-none focus:ring-2`}
                        style={{ ["--tw-ring-color" as any]: GREEN }}
                      />
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* Row 2 */}
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12">
                  <div className="min-w-0 lg:col-span-7">
                    <label className="text-[11px] font-medium text-gray-600">Address</label>
                    <textarea
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      className={`mt-2 min-h-[90px] w-full resize-none rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
                      style={{ ["--tw-ring-color" as any]: GREEN }}
                    />
                  </div>

                  <div className="min-w-0 lg:col-span-5">
                    <div className="grid grid-cols-1 gap-3">
                      <div className="min-w-0">
                        <label className="text-[11px] font-medium text-gray-600">Client</label>
                        <input
                          value={client}
                          onChange={(e) => setClient(e.target.value)}
                          className={`mt-2 w-full rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
                          style={{ ["--tw-ring-color" as any]: GREEN }}
                        />
                      </div>

                      <div className="min-w-0">
                        <label className="text-[11px] font-medium text-gray-600">Contact Info</label>
                        <input
                          value={contactInfo}
                          onChange={(e) => setContactInfo(e.target.value)}
                          className={`mt-2 w-full rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
                          style={{ ["--tw-ring-color" as any]: GREEN }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Dimensions */}
                <div className="mt-5">
                  <label className="text-[11px] font-medium text-gray-600">Dimensions</label>

                  <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-center">
                    <div className="min-w-0 lg:col-span-4">
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold shadow-sm"
                        style={{ backgroundColor: GREEN_SOFT, color: GREEN }}
                        onClick={openDimensionsModal}
                      >
                        <Plus className="h-4 w-4" aria-hidden />
                        Add Dimensions
                      </button>
                    </div>

                    <div className="min-w-0 lg:col-span-8">
                      <div className={`w-full rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-500`}>
                        {dimensionsSummary}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-[10px] text-gray-400">*uploading an image can automatically the description</div>
                </div>

                {/* Image + Description */}
                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-12 lg:items-start">
                  {/* LEFT slot: images */}
                  <div className="min-w-0 lg:col-span-4">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      multiple={false}
                      className="hidden"
                      onChange={onFilePicked}
                    />

                    {pickedImages.length === 0 ? (
                      <button
                        type="button"
                        className="inline-flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold shadow-sm"
                        style={{ backgroundColor: GREEN_SOFT, color: GREEN }}
                        onClick={openAnalyzeModal}
                      >
                        <Upload className="h-4 w-4" aria-hidden />
                        Insert Image to Analyze
                      </button>
                    ) : (
                      <div className={`rounded-md border ${BORDER} bg-white p-2`}>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold text-gray-700">Selected Images ({pickedImages.length})</div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={openAnalyzeModal}
                              className="rounded-md px-2 py-1 text-[11px] font-semibold border"
                              style={{ borderColor: "#E5E7EB", color: "#374151", backgroundColor: "#fff" }}
                            >
                              View
                            </button>

                            <button
                              type="button"
                              onClick={deleteActiveImage}
                              disabled={!pickedImages.length}
                              className={[
                                "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold border",
                                !pickedImages.length ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50",
                              ].join(" ")}
                              style={{ borderColor: "#E5E7EB", color: "#374151", backgroundColor: "#fff" }}
                              title="Delete current image"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                          </div>
                        </div>

                        <div className="mt-2 text-[10px] text-gray-500">
                          Current: {pickedImages.length ? `Image ${activeIndex + 1} / ${pickedImages.length}` : "None"}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="lg:col-span-1 flex items-center justify-center">
                    <span className="text-xs text-gray-400">or</span>
                  </div>

                  <div className="min-w-0 lg:col-span-7">
                    <label className="text-[11px] font-medium text-gray-600">Description</label>
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      placeholder="Write a summary of the dimensions"
                      className={`mt-2 block min-h-[90px] w-full resize-none rounded-md border ${BORDER} bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2`}
                      style={{ ["--tw-ring-color" as any]: GREEN }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* RIGHT */}
          <aside className="h-full min-h-0 flex flex-col gap-4">
            <section className={`rounded-2xl border ${BORDER} bg-white p-4 shadow-sm`}>
              <div className="text-[11px] font-semibold text-gray-700">Generated Client Code</div>
              <div className={`mt-3 rounded-xl border ${BORDER} bg-white p-4 text-lg font-bold text-gray-900`}>
                CL00001A-2024
              </div>
            </section>

            <section className={`flex-1 min-h-0 rounded-2xl border ${BORDER} bg-white p-4 shadow-sm flex flex-col`}>
              <div className="text-[11px] font-semibold text-gray-700">Use as Template...</div>

              <div
                className={[
                  "mt-3 flex-1 min-h-0 overflow-y-auto pr-2",
                  "[&::-webkit-scrollbar]:w-2",
                  "[&::-webkit-scrollbar-track]:rounded-full",
                  "[&::-webkit-scrollbar-track]:bg-[#EAF7E4]",
                  "[&::-webkit-scrollbar-thumb]:rounded-full",
                  "[&::-webkit-scrollbar-thumb]:bg-[#7ED957]",
                ].join(" ")}
                style={{ scrollbarWidth: "thin", scrollbarColor: `${GREEN} ${SCROLL_TRACK}` }}
              >
                <div className="space-y-3">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => console.log("Use template:", t.id)}
                      className={`w-full rounded-xl border ${BORDER} bg-white p-3 text-left transition hover:bg-gray-50`}
                    >
                      <div className="text-sm font-semibold text-gray-900">{t.jobNo}</div>
                      <div className="text-xs text-gray-500">{t.siteName}</div>
                    </button>
                  ))}
                </div>
              </div>
            </section>
          </aside>
        </div>

        {/* Footer buttons */}
        <div className="mt-4 flex items-center justify-center gap-4">
          <button
            type="button"
            className="w-[220px] rounded-lg px-6 py-2 text-sm font-semibold shadow-sm"
            style={{ backgroundColor: GREEN_SOFT, color: GREEN }}
            onClick={() => router.push("/admin/job-creation/main-task-assignment")}
          >
            Next
          </button>

          <button
            type="button"
            className="w-[220px] rounded-lg bg-gray-200 px-6 py-2 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-300"
            onClick={() => router.back()}
          >
            Go Back
          </button>
        </div>
      </div>

      {/* ----------------------------
          Dimensions Modal (with Messages + Chat)
         ---------------------------- */}
      {isDimensionsOpen ? (
        <div className="fixed inset-0 z-[70]">
          <button
            type="button"
            aria-label="Close dimensions modal"
            className="absolute inset-0 bg-black/40"
            onClick={closeDimensionsModal}
          />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className="relative w-full max-w-[1150px] rounded-2xl border border-gray-200 bg-white shadow-xl"
              style={{ maxHeight: "85vh" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid h-full grid-cols-1 gap-4 p-4 lg:grid-cols-[1fr_320px]">
                {/* LEFT */}
                <div className="min-h-0 rounded-2xl border border-gray-200 bg-white">
                  <div className="flex items-start justify-between gap-3 px-6 pt-5">
                    <div>
                      <div className="text-sm font-semibold text-gray-900">Dimensions</div>
                      <div className="mt-1 text-[11px] text-gray-500">
                        Add surfaces and measurements. You can leave Length/Width blank if unknown.
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={addDimRow}
                        className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold shadow-sm"
                        style={{ backgroundColor: GREEN_SOFT, color: GREEN }}
                      >
                        <Plus className="h-4 w-4" />
                        Add Row
                      </button>

                      <button
                        type="button"
                        onClick={closeDimensionsModal}
                        className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
                        aria-label="Close"
                        title="Close"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div className="px-6 pb-5">
                    <div className="mt-4 rounded-xl border border-gray-200 bg-white">
                      <div className="grid grid-cols-[44px_minmax(200px,1fr)_160px_160px] items-center gap-3 border-b border-gray-200 px-4 py-2 text-[11px] font-semibold text-gray-600">
                        <div className="text-center" />
                        <div>Surface</div>
                        <div className="text-center">Length</div>
                        <div className="text-center">Width</div>
                      </div>

                      <div className="max-h-[52vh] overflow-y-auto">
                        {dimDraft.length ? (
                          dimDraft.map((row) => (
                            <div
                              key={row.id}
                              className="grid grid-cols-[44px_minmax(200px,1fr)_160px_160px] items-center gap-3 px-4 py-2"
                            >
                              <div className="flex items-center justify-center">
                                <button
                                  type="button"
                                  onClick={() => removeDimRow(row.id)}
                                  className="grid h-9 w-9 place-items-center rounded-md border border-gray-200 bg-white hover:bg-gray-50"
                                  aria-label="Remove row"
                                  title="Remove"
                                >
                                  <span className="block h-[2px] w-4 rounded-full" style={{ backgroundColor: "#EF4444" }} />
                                </button>
                              </div>

                              <div className="min-w-0">
                                <input
                                  value={row.surface}
                                  onChange={(e) => updateDimRow(row.id, { surface: e.target.value })}
                                  placeholder="e.g. Living room wall"
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                                  style={{ ["--tw-ring-color" as any]: GREEN }}
                                />
                              </div>

                              <div className="min-w-0">
                                <input
                                  value={row.length}
                                  onChange={(e) => updateDimRow(row.id, { length: e.target.value })}
                                  placeholder="0"
                                  inputMode="decimal"
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 text-center outline-none focus:ring-2"
                                  style={{ ["--tw-ring-color" as any]: GREEN }}
                                />
                                <div className="mt-1 text-[10px] text-gray-400 text-center leading-none">meters</div>
                              </div>

                              <div className="min-w-0">
                                <input
                                  value={row.width}
                                  onChange={(e) => updateDimRow(row.id, { width: e.target.value })}
                                  placeholder="0"
                                  inputMode="decimal"
                                  className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 text-center outline-none focus:ring-2"
                                  style={{ ["--tw-ring-color" as any]: GREEN }}
                                />
                                <div className="mt-1 text-[10px] text-gray-400 text-center leading-none">meters</div>
                              </div>
                            </div>
                          ))
                        ) : (
                          <div className="px-4 py-10 text-center text-sm text-gray-500">
                            No dimensions yet. Add rows or open a message to use measurements.
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-center">
                      <button
                        type="button"
                        onClick={finishDimensions}
                        className="w-[280px] rounded-lg px-6 py-2.5 text-sm font-semibold text-white shadow-sm"
                        style={{ backgroundColor: GREEN }}
                      >
                        Finish
                      </button>
                    </div>
                  </div>
                </div>

                {/* RIGHT: messages list */}
                <aside className="min-h-0 rounded-2xl border border-gray-200 bg-white p-4">
                  <div className="text-sm font-semibold text-gray-900">Messages</div>

                  <div className="mt-3 max-h-[70vh] overflow-y-auto pr-1" style={{ scrollbarWidth: "thin" }}>
                    <div className="space-y-3">
                      {threads.map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => openThread(t)}
                          className="w-full rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm hover:bg-gray-50"
                        >
                          <div className="text-xs font-semibold text-gray-900">{t.name}</div>
                          <div className="mt-1 text-[11px] text-gray-500">{t.preview}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </aside>
              </div>

              {/* Chat modal overlay */}
              {isChatOpen && activeThread ? (
                <div className="absolute inset-0 z-[80]">
                  <button type="button" className="absolute inset-0 bg-black/30" onClick={closeThread} aria-label="Close chat" />

                  <div className="absolute inset-0 flex items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
                    <div className="w-full max-w-[520px] rounded-2xl border border-gray-200 bg-white shadow-xl">
                      {/* chat header */}
                      <div className="flex items-center justify-between px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-9 w-9 rounded-full bg-rose-200" />
                          <div>
                            <div className="text-xs font-semibold text-gray-900">{activeThread.name}</div>
                            <div className="text-[10px] text-gray-500">{activeThread.roleLabel}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={closeThread}
                          className="rounded-md p-2 text-gray-500 hover:bg-gray-100"
                          aria-label="Close"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>

                      <div className="px-4 pb-3">
                        <div className="flex items-center justify-center gap-2 text-[10px] text-gray-400">
                          <div className="h-px w-24 bg-gray-200" />
                          <span>Today</span>
                          <div className="h-px w-24 bg-gray-200" />
                        </div>
                      </div>

                      {/* messages */}
                      <div className="max-h-[360px] overflow-y-auto px-4 pb-3">
                        <div className="space-y-3">
                          {activeThread.messages.map((m) => {
                            const isMe = m.sender === "You"
                            return (
                              <div key={m.id} className={isMe ? "flex justify-end" : "flex justify-start"}>
                                <div
                                  className={[
                                    "relative max-w-[86%] rounded-xl px-3 py-2 text-[11px] leading-relaxed",
                                    isMe ? "bg-[#7ED957] text-white" : "bg-indigo-100 text-gray-800",
                                  ].join(" ")}
                                >
                                  {!isMe ? (
                                    <div className="mb-1 text-[10px] font-semibold text-gray-700">{m.sender}</div>
                                  ) : null}

                                  <div className="whitespace-pre-line">{m.text}</div>

                                  {/* 3 dots only if message has measurements */}
                                  {!isMe && m.measurements?.length ? (
                                    <div className="absolute right-2 top-2">
                                      <button
                                        type="button"
                                        onClick={() => setMenuMsgId((cur) => (cur === m.id ? null : m.id))}
                                        className="rounded-md p-1 text-gray-600 hover:bg-black/5"
                                        aria-label="More"
                                      >
                                        <MoreVertical className="h-4 w-4" />
                                      </button>

                                      {menuMsgId === m.id ? (
                                        <div className="absolute right-0 mt-1 w-40 overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                                          <button
                                            type="button"
                                            onClick={() => applyMeasurements(m.measurements!)}
                                            className="w-full px-3 py-2 text-left text-[11px] text-gray-700 hover:bg-gray-50"
                                          >
                                            Use measurements
                                          </button>
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}

                                  {m.time ? (
                                    <div className={["mt-1 text-[9px]", isMe ? "text-white/80" : "text-gray-500"].join(" ")}>
                                      {m.time}
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* input */}
                      <div className="border-t border-gray-200 p-3">
                        <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2">
                          <input
                            value={chatDraft}
                            onChange={(e) => setChatDraft(e.target.value)}
                            placeholder="Enter your message"
                            className="w-full text-[12px] text-gray-800 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setChatDraft("")}
                            className="grid h-9 w-9 place-items-center rounded-md text-white"
                            style={{ backgroundColor: GREEN }}
                            aria-label="Send"
                            title="Send"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ----------------------------
          Image Analyze Modal (square)
         ---------------------------- */}
      {isAnalyzeOpen ? (
        <div className="fixed inset-0 z-[60]">
          <button type="button" aria-label="Close modal" className="absolute inset-0 bg-black/40" onClick={closeAnalyzeModal} />

          <div className="absolute inset-0 flex items-center justify-center p-4">
            <div
              className={`relative w-full max-w-[520px] rounded-xl border ${BORDER} bg-white shadow-xl`}
              style={{
                aspectRatio: "1 / 1",
                maxHeight: "78vh",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={closeAnalyzeModal}
                className="absolute right-3 top-3 rounded-md p-1 text-gray-500 hover:bg-gray-100"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>

              <div className="flex h-full flex-col p-5">
                <div className="text-sm text-gray-700">Put sample image of the house</div>

                <div className="mt-3 flex-1 min-h-0 rounded-lg border border-gray-200 bg-gray-50 p-3 flex items-center justify-center">
                  {pickedImages.length ? (
                    <div className="relative w-full h-full flex items-center justify-center">
                      <button
                        type="button"
                        onClick={goPrev}
                        disabled={activeIndex === 0}
                        className={[
                          "absolute left-2 top-1/2 -translate-y-1/2",
                          "h-10 w-10 rounded-md border border-gray-200 bg-white/80",
                          "grid place-items-center shadow-sm",
                          activeIndex === 0 ? "opacity-40 cursor-not-allowed" : "hover:bg-white",
                        ].join(" ")}
                        aria-label="Previous image"
                      >
                        <ChevronLeft className="h-5 w-5 text-gray-700" />
                      </button>

                      <div className="flex flex-col items-center justify-center">
                        <img
                          src={pickedImages[activeIndex].url}
                          alt={`Selected ${activeIndex + 1}`}
                          className="max-h-[210px] w-auto max-w-[85%] rounded-md object-contain"
                        />
                        <div className="mt-2 text-[11px] text-gray-500">
                          Image {activeIndex + 1} / {pickedImages.length}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={goNext}
                        disabled={activeIndex === pickedImages.length - 1}
                        className={[
                          "absolute right-2 top-1/2 -translate-y-1/2",
                          "h-10 w-10 rounded-md border border-gray-200 bg-white/80",
                          "grid place-items-center shadow-sm",
                          activeIndex === pickedImages.length - 1 ? "opacity-40 cursor-not-allowed" : "hover:bg-white",
                        ].join(" ")}
                        aria-label="Next image"
                      >
                        <ChevronRight className="h-5 w-5 text-gray-700" />
                      </button>
                    </div>
                  ) : (
                    <div className="text-xs text-gray-400">No image selected.</div>
                  )}
                </div>

                {/* Picker ONLY here inside modal */}
                <div className="mt-4 flex items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={triggerFilePicker}
                    className="inline-flex items-center justify-center gap-2 rounded-md px-4 py-2 text-xs font-semibold shadow-sm"
                    style={{ backgroundColor: GREEN_SOFT, color: GREEN }}
                  >
                    <Upload className="h-4 w-4" aria-hidden />
                    Add Image to Analyze
                  </button>

                  <button
                    type="button"
                    onClick={deleteActiveImage}
                    disabled={!pickedImages.length}
                    className={[
                      "inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-xs font-semibold shadow-sm border",
                      !pickedImages.length ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-50",
                    ].join(" ")}
                    style={{ borderColor: "#E5E7EB", color: "#374151", backgroundColor: "#fff" }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                    Delete
                  </button>
                </div>

                <div className="mt-4">
                  <textarea
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Add Short Description of the client's request"
                    className="w-full min-h-[88px] resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:ring-2"
                    style={{ ["--tw-ring-color" as any]: GREEN }}
                  />
                </div>

                <div className="mt-4 grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={onAnalyze}
                    className="w-full rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: GREEN }}
                    disabled={!pickedImages.length}
                  >
                    Analyze
                  </button>

                  <button
                    type="button"
                    onClick={closeAnalyzeModal}
                    className="w-full rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm"
                    style={{ backgroundColor: "#E76B5A" }}
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
