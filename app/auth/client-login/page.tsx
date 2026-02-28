"use client"

import Image from "next/image"
import { useState } from "react"
import { useRouter } from "next/navigation"

export default function Login() {
  const [show, setShow] = useState(false)
  const router = useRouter()

  const handleAccess = () => {
    router.push("/client")
  }

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex items-center gap-4 mb-8">
          <Image
            src="/paint_pro_logo.png"
            alt="PaintPro logo icon"
            width={110}
            height={110}
            priority
          />
          <span className="text-3xl font-semibold text-[#00c065]">
            PaintPro
          </span>
        </div>

        {/* Form */}
        <div className="flex flex-col gap-5">
          {/* Label + Show/Hide */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800">
              Client Code
            </span>

            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              className="flex items-center gap-1 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <span>👁</span>
              <span>{show ? "Hide" : "Show"}</span>
            </button>
          </div>

          {/* Input */}
          <input
            type={show ? "text" : "password"}
            placeholder="Enter client code"
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
          />

          {/* Checkbox */}
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              defaultChecked
              className="h-4 w-4 rounded border border-gray-300"
            />
            <span>Access automatically in this PC</span>
          </label>

          {/* Access Button */}
          <button
            type="button"
            onClick={handleAccess}
            className="w-full rounded-lg bg-[#00c065] py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#00a054]"
          >
            Access
          </button>
        </div>
      </div>
    </div>
  )
}
