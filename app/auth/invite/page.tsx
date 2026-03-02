import { Suspense } from "react"
import InviteClient from "./InviteClient"

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading invite...</div>}>
      <InviteClient />
    </Suspense>
  )
}
