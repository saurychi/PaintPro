'use client'

import { useState } from 'react'
import { ChevronRight, Phone, Mail, MapPin, ChevronLeft, ChevronRight as ChevronRightIcon, ZoomIn, ZoomOut } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

interface TaskItem {
  id: number
  description: string
  price: number
}

interface TaskGroup {
  id: number
  name: string
  items: TaskItem[]
}

interface Recipient {
  id: number
  name: string
  email: string
}

const TASK_GROUPS: TaskGroup[] = [
  {
    id: 1,
    name: 'Wallpapering',
    items: [
      { id: 1, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
      { id: 2, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
      { id: 3, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
      { id: 4, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
    ],
  },
  {
    id: 2,
    name: 'Spray or Brush Roll Finish',
    items: [
      { id: 5, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
      { id: 6, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
      { id: 7, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
      { id: 8, description: 'Prep surface and touch up with told prep by 2 coats of Dulux Wash and Wear.', price: 50.15 },
    ],
  },
]

const RECIPIENTS: Recipient[] = [
  { id: 1, name: 'john doe', email: 'johndoe@gmail.com' },
  { id: 2, name: 'jane smith', email: 'jane.smith@gmail.com' },
  { id: 3, name: 'bob johnson', email: 'bob.j@gmail.com' },
]

function calculateGroupTotal(items: TaskItem[]): number {
  return parseFloat((items.reduce((sum, item) => sum + item.price, 0)).toFixed(2))
}

export default function InvoiceGeneration() {
  const [selectedRecipient, setSelectedRecipient] = useState<Recipient>(RECIPIENTS[0])
  const [sendEmail, setSendEmail] = useState(RECIPIENTS[0].email)
  const [currentPage, setCurrentPage] = useState(1)
  const totalPages = 5

  const handleRecipientChange = (recipient: Recipient) => {
    setSelectedRecipient(recipient)
    setSendEmail(recipient.email)
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      {/* Breadcrumb */}
      <div className="mb-8 flex items-center gap-2 text-sm">
        <a href="#" className="font-semibold text-gray-900 hover:underline">
          Job
        </a>
        <ChevronRight className="h-4 w-4 text-gray-400" />
        <span className="text-gray-600">Invoice Generation</span>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Left Column - Invoice */}
        <div className="lg:col-span-2">
          {/* PDF Preview Container */}
          <div className="rounded-lg bg-white shadow-lg overflow-hidden mb-4">
            {/* Invoice Card */}
            <div className="flex rounded-none bg-white overflow-hidden">
              {/* Dark Gray Invoice Section */}
              <div className="w-2/3 bg-gray-700 p-8 text-white relative overflow-hidden">
                <h2 className="mb-2 text-4xl font-bold">Tax Invoice</h2>
                
                <div className="mb-8 space-y-1 text-sm">
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4" />
                    +61 467 606 570
                  </p>
                  <p className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    pauljackmanpainting@outlook.com
                  </p>
                  <p className="flex items-center gap-2">
                    <MapPin className="h-4 w-4" />
                    Reakin Place Duracks NT 0830
                  </p>
                </div>

                {/* Company Name Overlay */}
                <div className="space-y-1">
                  <p className="text-sm uppercase tracking-wider text-gray-300">From</p>
                  <p className="text-lg font-bold">PAUL</p>
                  <p className="text-lg font-bold">JACKMAN</p>
                  <p className="text-xs uppercase tracking-wider text-gray-300">PAINTING AND DECORATING</p>
                </div>

                {/* Green accent wave */}
                <div className="absolute -bottom-8 -right-8 h-32 w-32 rounded-full bg-green-500 opacity-20"></div>
              </div>

              {/* Green Accent Section */}
              <div className="w-1/3 bg-gradient-to-br from-green-400 to-green-500 flex items-center justify-center p-6">
                <div className="h-24 w-24 rounded-full bg-white flex items-center justify-center">
                  <span className="text-2xl font-bold text-green-500">PJ</span>
                </div>
              </div>
            </div>

            {/* Customer Information */}
            <div className="space-y-2 border-b border-gray-300 px-8 py-6">
              <h3 className="font-bold text-gray-900">Dawn House</h3>
              <p className="text-sm text-gray-600">#0000002A-2024</p>
              <p className="text-sm text-gray-600">42 Wellington Street East Perth WA 6004 Australia</p>
              <p className="text-sm text-gray-600">Samantha Reynolds</p>
              <p className="text-sm text-gray-600">09662749655</p>
            </div>

            {/* Tasks Section */}
            <div className="space-y-8 p-8">
              <h3 className="text-sm font-bold uppercase text-gray-900">Tasks</h3>

              {TASK_GROUPS.map((group) => (
                <div key={group.id} className="space-y-4">
                  {/* Task Group Header */}
                  <div className="border border-gray-300 bg-white">
                    <div className="border-b border-gray-300 bg-gray-50 px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">{group.name}</p>
                    </div>

                    {/* Task Items */}
                    <div className="divide-y divide-gray-300">
                      {group.items.map((item) => (
                        <div key={item.id} className="flex items-center justify-between px-4 py-3">
                          <p className="flex-1 text-sm text-gray-700">{item.description}</p>
                          <p className="ml-4 text-sm font-semibold text-gray-900 whitespace-nowrap">
                            ${item.price.toFixed(2)}
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Total Row */}
                    <div className="flex items-center justify-between border-t-2 border-gray-300 bg-white px-4 py-3">
                      <p className="text-sm font-semibold text-gray-900">Total:</p>
                      <p className="text-sm font-bold text-gray-900">
                        ${calculateGroupTotal(group.items).toFixed(2)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}

              {/* ABN */}
              <div className="text-right text-xs text-gray-500 pt-4">
                ABN 83170676074
              </div>
            </div>
          </div>

          {/* Pagination Controls - Separate Gray Box */}
          <div className="flex items-center justify-center gap-4 rounded-lg bg-gray-600 px-6 py-3">
            <span className="text-sm text-gray-200">Page</span>
            <span className="text-sm font-bold text-white">{currentPage}</span>
            <span className="text-sm text-gray-200">/</span>
            <span className="text-sm font-bold text-white">{totalPages}</span>
            <div className="ml-2 flex gap-2">
              <button
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                className="rounded bg-gray-700 p-2 hover:bg-gray-800 text-white"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                className="rounded bg-gray-700 p-2 hover:bg-gray-800 text-white"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Right Column - Send Invoice Form */}
        <div>
          <div className="sticky top-8 rounded-lg bg-white p-6 shadow-md">
            <h3 className="mb-6 text-lg font-semibold text-gray-900">Send Invoice</h3>

            {/* Send To Dropdown */}
            <div className="mb-6 space-y-2">
              <label className="text-sm font-medium text-gray-700">Send to:</label>
              <DropdownMenu>
                <DropdownMenuTrigger className="w-full rounded border border-gray-300 bg-white px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between">
                  <span>{selectedRecipient.name}</span>
                  <ChevronRight className="h-4 w-4 text-gray-400" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-48">
                  {RECIPIENTS.map((recipient) => (
                    <DropdownMenuItem
                      key={recipient.id}
                      onClick={() => handleRecipientChange(recipient)}
                    >
                      {recipient.name}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* Optional Label */}
            <p className="mb-4 text-xs text-gray-500">optional:</p>

            {/* Email Input */}
            <div className="mb-8 space-y-2">
              <label className="text-sm font-medium text-gray-700">Send to:</label>
              <Input
                type="email"
                placeholder="email@example.com"
                value={sendEmail}
                onChange={(e) => setSendEmail(e.target.value)}
                className="rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {/* Action Buttons */}
            <div className="space-y-3">
              <Button
                className="w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-2 rounded"
                onClick={() => {
                  console.log('Sending invoice to:', sendEmail)
                }}
              >
                Finish
              </Button>
              <Button
                variant="outline"
                className="w-full bg-gray-200 hover:bg-gray-300 text-gray-900 font-semibold py-2 rounded border-0"
              >
                Go Back
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
