"use client"

import React, { useState } from "react"
// import { auth } from "@/firebase/firebase.config";
import { signOut } from "firebase/auth"
import { useRouter } from "next/navigation"

function AdminSettings() {
  const router = useRouter()

  // State for profile - mocking data based on image
  const [profile, setProfile] = useState({
    firstName: "First Name",
    lastName: "Last Name",
    email: "Email",
    phone: "0X XXXX XXXX",
  })

  // State for toggles
  const [toggles, setToggles] = useState({
    jobUpdates: false,
    messages: true,
    autoDownload: true,
    assignEmployees: true,
  })

  const handleProfileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setProfile((prev) => ({ ...prev, [name]: value }))
  }

  const handleToggle = (key: keyof typeof toggles) => {
    setToggles((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const handleLogout = async () => {
    try {
      // await signOut(auth);
      await signOut((null as any)) // remove this line once auth is imported back
      router.push("/auth/signin")
    } catch (error) {
      console.error("Error signing out:", error)
    }
  }

  return (
    <main className="h-screen bg-white p-6 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 mb-6">
        <h1 className="text-3xl font-bold text-[#1a1a4b]">Settings</h1>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        <div className="w-full">
          {/* Profile Details Section */}
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-lg font-medium text-gray-700 whitespace-nowrap">Profile Details</h2>
              <div className="h-px bg-gray-200 w-full" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">First name</label>
                <input
                  type="text"
                  name="firstName"
                  value={profile.firstName}
                  onChange={handleProfileChange}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Last name</label>
                <input
                  type="text"
                  name="lastName"
                  value={profile.lastName}
                  onChange={handleProfileChange}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Email</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                      <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                    </svg>
                  </div>
                  <input
                    type="email"
                    name="email"
                    value={profile.email}
                    onChange={handleProfileChange}
                    className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M2 3a1 1 0 011-1h2.153a1 1 0 01.986.836l.74 4.435a1 1 0 01-.54 1.06l-1.548.773a11.037 11.037 0 006.105 6.105l.774-1.548a1 1 0 011.059-.54l4.435.74a1 1 0 01.836.986V17a1 1 0 01-1 1h-2C7.82 18 2 12.18 2 5V3z" />
                    </svg>
                  </div>
                  <input
                    type="tel"
                    name="phone"
                    value={profile.phone}
                    onChange={handleProfileChange}
                    className="w-full border border-gray-200 rounded-lg pl-10 pr-4 py-2.5 text-gray-600 focus:outline-none focus:border-[#00c065] transition-colors"
                  />
                </div>
              </div>
            </div>

            <button className="bg-[#dcfce7] text-[#166534] hover:bg-[#bbf7d0] px-8 py-2 rounded-lg font-medium transition-colors">
              Save
            </button>
          </div>

          {/* Actions Section */}
          <div className="mb-10">
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-lg font-medium text-gray-700 whitespace-nowrap">Actions</h2>
              <div className="h-px bg-gray-200 w-full" />
            </div>

            <div className="space-y-6">
              <ToggleItem
                label="Receive Notifications from Job Updates"
                active={toggles.jobUpdates}
                onClick={() => handleToggle("jobUpdates")}
              />
              <ToggleItem
                label="Receive Notifications from Messages"
                active={toggles.messages}
                onClick={() => handleToggle("messages")}
              />
              <ToggleItem
                label="Auto Download Documents (Quotes, Invoice, Etc.)"
                active={toggles.autoDownload}
                onClick={() => handleToggle("autoDownload")}
              />
              <ToggleItem
                label="Automatically assign employees"
                active={toggles.assignEmployees}
                onClick={() => handleToggle("assignEmployees")}
              />
            </div>
          </div>

          {/* Authentication Section */}
          <div>
            <div className="flex items-center gap-4 mb-6">
              <h2 className="text-lg font-medium text-gray-700 whitespace-nowrap">Authentication</h2>
              <div className="h-px bg-gray-200 w-full" />
            </div>

            <div>
              <p className="text-sm font-medium text-gray-700 mb-3">Log out of this pc</p>
              <button
                onClick={handleLogout}
                className="bg-red-100 text-red-500 hover:bg-red-200 px-12 py-2 rounded-lg font-medium transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}

// Helper component for Toggle Switch
function ToggleItem({
  label,
  active,
  onClick,
}: {
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={onClick}
        className={`w-12 h-6 rounded-full p-1 transition-colors duration-200 ease-in-out relative ${
          active ? "bg-[#00c065]" : "bg-gray-300"
        }`}
      >
        <div
          className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform duration-200 ease-in-out ${
            active ? "translate-x-6" : "translate-x-0"
          }`}
        />
      </button>
      <span className="text-gray-700 font-medium">{label}</span>
    </div>
  )
}

export default AdminSettings
