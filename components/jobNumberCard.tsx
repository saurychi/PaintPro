"use client"

type CurrentJob = {
  statusLabel: string
  jobNo: string
  siteName: string
}

export default function jobNumberCard({
  statusLabel,
  jobNo,
  siteName,
}: CurrentJob) {
  return (
    <div className="h-full">
      <section className="h-full rounded-lg border border-gray-200 bg-white p-4 shadow-sm flex flex-col justify-center">
        {/* Status Indicator */}
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <span 
            className="h-2 w-2 rounded-full" 
            style={{ backgroundColor: "#7ED957" }} 
          />
          <span>Status: {statusLabel}</span>
        </div>

        {/* Job Info Box */}
        <div className="mt-3 rounded-md border border-gray-200 bg-white px-3 py-2">
          <div className="text-base font-semibold text-gray-900">
            {jobNo}
          </div>
          <div className="text-sm text-gray-600">
            {siteName}
          </div>
        </div>
      </section>
    </div>
  )
}