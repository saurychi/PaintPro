import { Suspense } from "react"
import SigninClient from "./SigninClient"

export default function SigninPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-600">Loading sign in...</div>}>
      <SigninClient />
    </Suspense>
  )
}
