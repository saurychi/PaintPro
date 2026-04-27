"use client"

import React, { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { useClientProject } from "../ClientShellClient"
import SignatureCanvas from "react-signature-canvas"
import { Upload } from "lucide-react"

const ACCENT = "#00c065"

const btnBase =
  "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-all duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-offset-2"
const btnNeutral =
  `${btnBase} border border-gray-200 bg-white px-3 h-9 text-gray-700 hover:bg-gray-50 hover:shadow-md`
const btnPrimary =
  `${btnBase} bg-[#00c065] px-3 h-9 text-white hover:bg-[#00a054] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60`
const btnDanger =
  `${btnBase} border border-red-200 bg-white px-4 py-2 text-red-600 hover:bg-red-50 hover:shadow-md`

export default function ClientSettings() {
  const router = useRouter()
  const { projectId } = useClientProject()
  const { resolvedTheme, setTheme } = useTheme()
  const isDark = resolvedTheme === "dark"

  const signatureRef = useRef<SignatureCanvas | null>(null)
  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw")
  const [uploadedSignatureFile, setUploadedSignatureFile] = useState<File | null>(null)
  const [uploadFileName, setUploadFileName] = useState<string | null>(null)
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(null)
  const [signatureBusy, setSignatureBusy] = useState(false)
  const [signatureMsg, setSignatureMsg] = useState<string | null>(null)
  const [signatureErr, setSignatureErr] = useState<string | null>(null)

  useEffect(() => {
    if (!projectId) return
    fetch("/api/client/signature")
      .then((res) => res.json())
      .then((data) => {
        if (data.signedUrl) setSignaturePreviewUrl(data.signedUrl)
      })
      .catch(console.error)
  }, [projectId])

  const handleSignatureFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedSignatureFile(file)
    setUploadFileName(file.name)
    setSignatureErr(null)
    setSignatureMsg(null)
  }

  const clearUpload = () => {
    setUploadedSignatureFile(null)
    setUploadFileName(null)
    setSignatureErr(null)
    setSignatureMsg(null)
  }

  const clearSignature = () => {
    setSignatureErr(null)
    setSignatureMsg(null)
    signatureRef.current?.clear()
  }

  const saveSignature = async () => {
    setSignatureErr(null)
    setSignatureMsg(null)

    try {
      let file: File

      if (signatureMode === "draw") {
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
          setSignatureErr("Please draw your signature first.")
          return
        }
        const dataUrl = signatureRef.current.getTrimmedCanvas().toDataURL("image/png")
        const blob = await fetch(dataUrl).then((res) => res.blob())
        file = new File([blob], "signature.png", { type: "image/png" })
      } else {
        if (!uploadedSignatureFile) {
          setSignatureErr("Please select an image file.")
          return
        }
        file = new File([uploadedSignatureFile], "signature.png", { type: "image/png" })
      }

      setSignatureBusy(true)

      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/client/signature", {
        method: "POST",
        body: formData,
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result?.error || "Failed to save signature.")
      }

      if (result.signedUrl) setSignaturePreviewUrl(result.signedUrl)

      if (signatureMode === "draw") {
        signatureRef.current?.clear()
      } else {
        setUploadedSignatureFile(null)
        setUploadFileName(null)
      }

      setSignatureMsg("Signature saved.")
    } catch (e: any) {
      console.error(e)
      setSignatureErr(e?.message || "Failed to save signature.")
    } finally {
      setSignatureBusy(false)
    }
  }

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/client-access", { method: "DELETE" })
    } catch {}

    try {
      localStorage.removeItem("paintpro_client_access")
      sessionStorage.removeItem("paintpro_client_access")
      document.cookie = "paintpro_client_access=; path=/; max-age=0; SameSite=Lax"
    } catch {}

    router.replace("/auth/signin")
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

      <div className="mt-6">
        <Card>
          <div className="grid gap-6">
            {/* Signature */}
            <div className="grid gap-3">
              <SectionTitle
                title="Signature"
                subtitle="Your signature used on project documents."
              />

              <div className="rounded-lg border border-gray-200 bg-white">
                <div className="px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-gray-900">
                        Signature
                      </p>
                      <p className="mt-0.5 text-xs text-gray-500">
                        Draw or upload your signature
                      </p>
                    </div>

                    <div className="flex items-center rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-xs font-semibold">
                      {(["draw", "upload"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => setSignatureMode(mode)}
                          className={[
                            "rounded-md px-3 py-1 capitalize transition-colors",
                            signatureMode === mode
                              ? "bg-white text-gray-900 shadow-sm"
                              : "text-gray-500 hover:text-gray-700",
                          ].join(" ")}>
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-3">
                    <div className="min-w-0 flex-1">
                      {signatureMode === "draw" ? (
                        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                          <SignatureCanvas
                            ref={signatureRef}
                            penColor="black"
                            canvasProps={{ className: "h-[100px] w-full bg-white" }}
                          />
                        </div>
                      ) : (
                        <label className="flex h-[100px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-white transition hover:bg-gray-50">
                          <Upload className="h-5 w-5 text-gray-300" />
                          <span className="px-4 text-center text-xs text-gray-500">
                            {uploadFileName ?? "Click to upload PNG / JPG"}
                          </span>
                          <input
                            type="file"
                            accept="image/png,image/jpeg,image/jpg"
                            className="hidden"
                            onChange={handleSignatureFileChange}
                          />
                        </label>
                      )}

                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {signatureMode === "draw" ? (
                          <button
                            type="button"
                            onClick={clearSignature}
                            disabled={signatureBusy}
                            className={`${btnNeutral} disabled:opacity-60`}>
                            Clear
                          </button>
                        ) : uploadedSignatureFile ? (
                          <button
                            type="button"
                            onClick={clearUpload}
                            disabled={signatureBusy}
                            className={`${btnNeutral} disabled:opacity-60`}>
                            Clear
                          </button>
                        ) : null}

                        <button
                          type="button"
                          onClick={saveSignature}
                          disabled={signatureBusy}
                          className={btnPrimary}>
                          {signatureBusy ? "Saving..." : "Save"}
                        </button>
                      </div>

                      {signatureErr ? (
                        <p className="mt-1.5 text-xs font-semibold text-red-600">
                          {signatureErr}
                        </p>
                      ) : null}
                      {signatureMsg ? (
                        <p className="mt-1.5 text-xs font-semibold text-emerald-700">
                          {signatureMsg}
                        </p>
                      ) : null}
                    </div>

                    <div className="w-[110px] shrink-0">
                      <p className="mb-1.5 text-xs font-medium text-gray-500">
                        Current
                      </p>
                      <div className="flex h-[100px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2">
                        {signaturePreviewUrl ? (
                          <img
                            src={signaturePreviewUrl}
                            alt="Saved signature"
                            className="max-h-full max-w-full object-contain"
                          />
                        ) : (
                          <p className="text-center text-[11px] text-gray-400">
                            No signature saved
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Appearance */}
            <div>
              <div className="h-px w-full bg-gray-200" />
              <div className="mt-5 grid gap-3">
                <SectionTitle
                  title="Appearance"
                  subtitle="Control the look and feel of the interface."
                />
                <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">Dark mode</p>
                    <p className="mt-1 text-sm text-gray-600">
                      Switch between light and dark interface.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                    className={btnNeutral}>
                    {isDark ? "Light mode" : "Dark mode"}
                  </button>
                </div>
              </div>
            </div>

            {/* Session */}
            <div>
              <div className="h-px w-full bg-gray-200" />
              <div className="mt-5 grid gap-3">
                <SectionTitle
                  title="Session"
                  subtitle="Sign out of your client session on this device."
                />
                <div>
                  <button type="button" onClick={handleLogout} className={btnDanger}>
                    Log Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <style jsx global>{`
        canvas {
          touch-action: none;
        }
      `}</style>
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
      <div className="p-4">{children}</div>
    </div>
  )
}

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: ACCENT }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-[13px] font-semibold text-gray-900">{title}</p>
        {subtitle ? <p className="mt-0.5 text-[12px] text-gray-500">{subtitle}</p> : null}
      </div>
    </div>
  )
}
