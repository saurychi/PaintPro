"use client"

import { useRouter } from "next/navigation"

type CurrentJob = {
  statusLabel: string
  jobNo: string
  siteName: string
  onCreateJob?: () => void
}

export default function CurrentJobCard({
  statusLabel,
  jobNo,
  siteName,
  onCreateJob,
}: CurrentJob) {

  const router = useRouter()

  return (
    <div className="space-y-3 h-full flex flex-col justify-between">
      <section className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "#7ED957" }} />
          <span>Status: {statusLabel}</span>
        </div>

        <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2">
          <div className="text-base font-semibold text-gray-900">
            {jobNo}
          </div>
          <div className="text-sm text-gray-600">
            {siteName}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <button
          type="button"
          onClick={() => {
            onCreateJob?.()
            router.push("/admin/job-creation/basic-details")
          }}
          className="flex w-full items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90"
          style={{ backgroundColor: "#7ED957" }}
        >
          <span className="text-base leading-none">+</span>
          Create Job
        </button>
      </section>
    </div>
  )
}
