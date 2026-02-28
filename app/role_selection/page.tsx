"use client"

import Image from "next/image"
import Link from "next/link"

export default function RoleSelection() {
  return (
    <div className="flex min-h-screen w-full">
      {/* Left Image */}
      <div className="relative flex-1 min-h-screen">
        <Image
          src="/role_selection_bg.jpg"
          alt="Room interior"
          fill
          priority
          className="object-cover"
        />
      </div>

      {/* Right Content */}
      <div className="flex flex-1 flex-col items-center justify-center bg-white px-6">
        <h1 className="text-[20px] font-medium text-gray-900 text-center mb-8">
          What role you are in our system?
        </h1>

        <div className="flex flex-col gap-4 w-[260px]">
          <Link href="/auth/client-login" className="w-full">
            <button
              type="button"
              className="w-full rounded-xl bg-gray-200 px-6 py-3.5 text-[15px] font-medium text-gray-800 transition-all duration-150 hover:bg-gray-300 hover:-translate-y-[1px] active:translate-y-0"
            >
              Client
            </button>
          </Link>

          <Link href="/auth/signin" className="w-full">
            <button
              type="button"
              className="w-full rounded-xl bg-gray-200 px-6 py-3.5 text-[15px] font-medium text-gray-800 transition-all duration-150 hover:bg-gray-300 hover:-translate-y-[1px] active:translate-y-0"
            >
              Staff
            </button>
          </Link>
        </div>
      </div>
    </div>
  )
}
