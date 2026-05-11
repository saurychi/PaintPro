"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SignatureCanvas from "react-signature-canvas";
import { Check, Loader2, PenLine, RefreshCw } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";

// /client/cancellation-agreement?projectId=...
//
// Client-facing page where the signer reads the cancellation agreement
// (rendered in an iframe via /api/cancellation-agreement/html) and adds
// their signature. Mirrors the quotation/invoice signing UX but
// stripped to the essentials — there's no quotation/invoice line-item
// breakdown to show, just the agreement and the pad.

export default function CancellationAgreementSigningPage() {
  const searchParams = useSearchParams();
  const projectId = searchParams.get("projectId") || "";

  const signatureRef = useRef<SignatureCanvas | null>(null);
  const signatureWrapRef = useRef<HTMLDivElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState<{
    project_id: string;
    project_code: string | null;
    title: string | null;
    status: string | null;
    cancellation_phase: string | null;
  } | null>(null);
  const [docStatus, setDocStatus] = useState<string>("missing");
  const [confirmCode, setConfirmCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectId) {
      setLoading(false);
      return;
    }
    try {
      const [projectRes, docRes] = await Promise.all([
        fetch(
          `/api/planning/getProjectOverview?projectId=${encodeURIComponent(projectId)}`,
          { cache: "no-store" },
        ),
        fetch(
          `/api/planning/cancellationAgreementStatus?projectId=${encodeURIComponent(projectId)}`,
          { cache: "no-store" },
        ),
      ]);
      const projectData = await projectRes.json().catch(() => null);
      const docData = await docRes.json().catch(() => null);

      if (projectData?.project) {
        setProject({
          project_id: projectData.project.project_id,
          project_code: projectData.project.project_code,
          title: projectData.project.title,
          status: projectData.project.status,
          cancellation_phase:
            projectData.project.cancellation_phase ?? null,
        });
      }
      if (docData) setDocStatus(docData.documentStatus ?? "missing");
    } catch {
      // Errors surface via the empty/loading states below.
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Match the canvas to its container width so the strokes line up
  // with the visible drawing area.
  useEffect(() => {
    function resize() {
      const wrap = signatureWrapRef.current;
      const canvas = signatureRef.current?.getCanvas();
      if (!wrap || !canvas) return;
      const rect = wrap.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = 180;
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  async function handleSign() {
    if (!project || submitting) return;
    if (!signatureRef.current || signatureRef.current.isEmpty()) {
      toast.error("Please draw your signature.");
      return;
    }
    if (
      !confirmCode.trim() ||
      confirmCode.trim() !== (project.project_code ?? "").trim()
    ) {
      toast.error("Project code does not match.");
      return;
    }

    try {
      setSubmitting(true);
      const dataUrl = signatureRef.current
        .getTrimmedCanvas()
        .toDataURL("image/png");

      const res = await fetch(
        "/api/client/documents/cancellation-agreement-signature",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId,
            projectCode: project.project_code,
            signatureDataUrl: dataUrl,
          }),
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          [data?.error, data?.details].filter(Boolean).join(": ") ||
            "Failed to submit signature.",
        );
      }
      toast.success("Cancellation agreement signed.", {
        description: "Thank you. The project has been formally closed-out.",
      });
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to sign agreement.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!projectId) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-gray-600">
        Missing projectId in the URL.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-500">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="mx-auto max-w-xl p-6 text-sm text-gray-600">
        Project not found.
      </div>
    );
  }

  const alreadySigned = docStatus === "signed";
  const cancellationOpen =
    project.status === "cancelled" &&
    (project.cancellation_phase === "document" ||
      project.cancellation_phase === null);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4 p-4 sm:p-6">
      <header className="rounded-md border border-red-200 bg-red-50 p-4">
        <h1 className="text-lg font-semibold text-red-700">
          Cancellation Agreement
        </h1>
        <p className="mt-1 text-[13px] text-red-600">
          {project.project_code ? `Project ${project.project_code} — ` : ""}
          {project.title ?? "Untitled Project"}
        </p>
        <p className="mt-2 text-[12px] text-red-700">
          The project has been cancelled. Please review the agreement below
          and sign to acknowledge the close-out terms. Both parties' records
          will be retained on file.
        </p>
      </header>

      <div className="flex h-[60vh] min-h-[420px] flex-col overflow-hidden rounded-md border border-gray-200">
        <div className="flex items-center justify-between border-b border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-500">
          <span>Agreement preview</span>
          <button
            type="button"
            onClick={refresh}
            className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-900">
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>
        <iframe
          title="Cancellation Agreement preview"
          src={`/api/cancellation-agreement/html?projectId=${encodeURIComponent(projectId)}`}
          className="h-full w-full border-0"
        />
      </div>

      {alreadySigned ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-[13px] text-emerald-800">
          <Check className="mr-1 inline h-4 w-4 align-text-bottom" />
          You've already signed this agreement. Thank you.
        </div>
      ) : !cancellationOpen ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-800">
          The agreement isn't open for signing yet. Your project manager will
          let you know when it's ready.
        </div>
      ) : (
        <div className="rounded-md border border-gray-200 p-4">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <PenLine className="h-4 w-4 text-red-600" /> Sign here
          </h2>

          <div
            ref={signatureWrapRef}
            className="mt-2 rounded-md border-2 border-dashed border-gray-300 bg-white">
            <SignatureCanvas
              ref={signatureRef}
              penColor="#111827"
              backgroundColor="rgba(0,0,0,0)"
              canvasProps={{
                style: {
                  width: "100%",
                  height: "180px",
                  display: "block",
                },
              }}
            />
          </div>
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => signatureRef.current?.clear()}
              className="text-[11px] font-semibold text-gray-500 hover:text-gray-900">
              Clear signature
            </button>
          </div>

          <label className="mt-4 block">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
              Confirm project code
            </span>
            <input
              type="text"
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value)}
              placeholder={project.project_code ?? ""}
              disabled={submitting}
              className="mt-1 block h-10 w-full rounded-md border border-gray-200 bg-white px-3 font-mono text-sm shadow-sm focus:border-red-300 focus:outline-none focus:ring-2 focus:ring-red-100 disabled:opacity-60"
            />
          </label>

          <button
            type="button"
            onClick={handleSign}
            disabled={submitting}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-md bg-red-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-red-700 disabled:opacity-50 sm:w-auto">
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Check className="h-4 w-4" />
            )}
            {submitting ? "Submitting..." : "Sign cancellation agreement"}
          </button>
        </div>
      )}
    </div>
  );
}
