"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import rawCountries from "@/lib/data/country-by-calling-code.json";
import SignatureCanvas from "react-signature-canvas";
import { Calculator, ChevronRight, Upload, Wrench } from "lucide-react";
import ProjectTimeReferenceSettings from "@/components/settings/projectTimeReferenceSettings";
import HolidaySettings from "@/components/settings/holidaySettings";
import {
  getAutoStartProjects,
  setAutoStartProjects,
} from "@/lib/settings/autoStartProjects";
import { SIGNATURE_UPDATED_EVENT } from "@/lib/hooks/useUserSignature";

const ACCENT = "#00c065";

type CountryRaw = { country: string; calling_code: number };
type CountryOption = { label: string; code: string };

type DbUser = {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: "client" | "staff" | "manager" | "admin";
  signature_url: string | null;
};

function rolePill(role: DbUser["role"]) {
  if (role === "admin") return "border-gray-200 bg-gray-100 text-gray-800";
  if (role === "manager")
    return "border-purple-200 bg-purple-500/10 text-purple-700";
  if (role === "staff") return "border-blue-200 bg-blue-500/10 text-blue-700";
  return "border-emerald-200 bg-emerald-500/10 text-emerald-700";
}

function roleLabel(role: DbUser["role"]) {
  if (role === "admin") return "Admin";
  if (role === "manager") return "Manager";
  if (role === "staff") return "Staff";
  return "Client";
}

function parsePhone(raw?: string | null) {
  const fallback = { countryCode: "+63", local: "" };
  if (!raw) return fallback;
  const s = String(raw).trim();
  const m = s.match(/^(\+\d+)\s*(.*)$/);
  if (!m) return { ...fallback, local: s };
  return { countryCode: m[1], local: (m[2] || "").trim() };
}

function formatPhoneFull(countryCode: string, local: string) {
  const cc = countryCode.trim();
  const lc = local.trim();
  if (!lc) return null;
  return `${cc} ${lc}`;
}

function SectionTitle({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: ACCENT }}
            aria-hidden="true"
          />
          <p className="text-[13px] font-semibold leading-5 text-gray-900">{title}</p>
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-5 text-gray-500">{subtitle}</p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center rounded-md text-xs font-semibold shadow-sm transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#00c065]/25";
const btnNeutral = `${btnBase} border border-gray-200 bg-white px-2.5 h-8 text-gray-900 hover:bg-gray-50 hover:shadow-md`;
const btnPrimary = `${btnBase} bg-[#00c065] px-2.5 h-8 text-white hover:bg-[#00a054] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60`;
const btnDanger = `${btnBase} border border-red-200 bg-white px-3 h-8 text-red-600 hover:bg-red-50 hover:shadow-md`;

// Admin-only toggle: when enabled, a `ready_to_start` project auto-fires
// the kickoff confirmation flow the moment the (simulated or real) clock
// reaches its scheduled start time. Persisted in localStorage per browser.
function AutoStartProjectsToggle() {
  const [enabled, setEnabledState] = useState<boolean>(false);

  useEffect(() => {
    setEnabledState(getAutoStartProjects());
  }, []);

  function handleChange(next: boolean) {
    setEnabledState(next);
    setAutoStartProjects(next);
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Auto-start projects on schedule
          </p>
          <p className="mt-1 text-sm text-gray-600">
            When on, a project sitting in &ldquo;ready to start&rdquo; will
            automatically advance to &ldquo;in progress&rdquo; the moment
            its scheduled start time arrives (using the simulated clock if
            one is set). Schedule conflicts still block it.
          </p>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => handleChange(!enabled)}
          className={[
            "relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border transition-colors",
            enabled
              ? "border-[#00c065] bg-[#00c065]"
              : "border-gray-300 bg-gray-200",
          ].join(" ")}
        >
          <span
            className={[
              "inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform",
              enabled ? "translate-x-6" : "translate-x-1",
            ].join(" ")}
          />
        </button>
      </div>
    </div>
  );
}

export default function AdminSettings() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const countries: CountryOption[] = useMemo(() => {
    const codes = Array.from(
      new Set(
        (rawCountries as CountryRaw[])
          .filter((c) => c?.calling_code)
          .map((c) => `+${c.calling_code}`),
      ),
    ).sort((a, b) => a.localeCompare(b));
    return codes.map((code) => ({ label: code, code }));
  }, []);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [profile, setProfile] = useState<DbUser>({
    id: "",
    username: "",
    email: null,
    phone: null,
    role: "client",
    signature_url: null,
  });

  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);

  const [phoneDraft, setPhoneDraft] = useState({
    countryCode: "+63",
    local: "",
  });
  const signatureRef = useRef<SignatureCanvas | null>(null);
  const [signatureMode, setSignatureMode] = useState<"draw" | "upload">("draw");
  const [uploadedSignatureFile, setUploadedSignatureFile] =
    useState<File | null>(null);
  const [uploadFileName, setUploadFileName] = useState<string | null>(null);
  const [signaturePreviewUrl, setSignaturePreviewUrl] = useState<string | null>(
    null,
  );
  const [signatureBusy, setSignatureBusy] = useState(false);
  const [signatureMsg, setSignatureMsg] = useState<string | null>(null);
  const [signatureErr, setSignatureErr] = useState<string | null>(null);

  useEffect(() => {
    const boot = async () => {
      setLoading(true);
      setLoadErr(null);

      const { data, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) console.error(sessErr);

      const session = data.session;
      if (!session) {
        router.replace("/auth/signin");
        return;
      }

      try {
        const { data: row, error } = await supabase
          .from("users")
          .select("id, username, email, phone, role, signature_url")
          .eq("id", session.user.id)
          .maybeSingle<DbUser>();

        if (error) throw error;
        if (!row) {
          await supabase.auth.signOut();
          router.replace("/auth/invite?reason=not_invited");
          return;
        }

        const mergedEmail = row.email ?? (session.user.email || null);
        const merged: DbUser = { ...row, email: mergedEmail };

        setProfile(merged);
        setPhoneDraft(parsePhone(merged.phone));
      } catch (e: any) {
        console.error(e);
        setLoadErr(e?.message || "Failed to load profile.");
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [router]);

  useEffect(() => {
    const loadSignaturePreview = async () => {
      if (!profile.signature_url) {
        setSignaturePreviewUrl(null);
        return;
      }

      try {
        const { data, error: sessErr } = await supabase.auth.getSession();
        if (sessErr) throw sessErr;

        const session = data.session;
        if (!session) {
          setSignaturePreviewUrl(null);
          return;
        }

        const response = await fetch("/api/signatures", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            [result?.error, result?.details].filter(Boolean).join(": ") ||
              "Failed to load signature.",
          );
        }

        setSignaturePreviewUrl(result.signedUrl || null);
      } catch (error) {
        console.error(error);
        setSignaturePreviewUrl(null);
      }
    };

    loadSignaturePreview();
  }, [profile.signature_url]);

  const startEditPhone = () => {
    setPhoneErr(null);
    setPhoneMsg(null);
    setPhoneDraft(parsePhone(profile.phone));
    setPhoneEditing(true);
  };

  const cancelEditPhone = () => {
    setPhoneErr(null);
    setPhoneMsg(null);
    setPhoneDraft(parsePhone(profile.phone));
    setPhoneEditing(false);
  };

  const savePhone = async () => {
    setPhoneErr(null);
    setPhoneMsg(null);

    const phoneFull = formatPhoneFull(phoneDraft.countryCode, phoneDraft.local);

    try {
      setPhoneBusy(true);

      const { data, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;
      const session = data.session;
      if (!session) {
        router.replace("/auth/signin");
        return;
      }

      const { error } = await supabase
        .from("users")
        .update({ phone: phoneFull, updated_at: new Date().toISOString() })
        .eq("id", session.user.id);

      if (error) throw error;

      setProfile((p) => ({ ...p, phone: phoneFull }));
      setPhoneEditing(false);
      setPhoneMsg("Saved.");
    } catch (e: any) {
      console.error(e);
      setPhoneErr(e?.message || "Failed to save phone.");
    } finally {
      setPhoneBusy(false);
    }
  };

  const handleSignatureFileChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadedSignatureFile(file);
    setUploadFileName(file.name);
    setSignatureErr(null);
    setSignatureMsg(null);
  };

  const clearUpload = () => {
    setUploadedSignatureFile(null);
    setUploadFileName(null);
    setSignatureErr(null);
    setSignatureMsg(null);
  };

  const clearSignature = () => {
    setSignatureErr(null);
    setSignatureMsg(null);
    signatureRef.current?.clear();
  };

  const fileToDataUrl = (file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();

      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
          return;
        }

        reject(new Error("Failed to read signature file."));
      };

      reader.onerror = () =>
        reject(new Error("Failed to read signature file."));
      reader.readAsDataURL(file);
    });
  };

  const saveSignature = async () => {
    setSignatureErr(null);
    setSignatureMsg(null);

    try {
      let signatureDataUrl = "";

      if (signatureMode === "draw") {
        if (!signatureRef.current || signatureRef.current.isEmpty()) {
          setSignatureErr("Please draw your signature first.");
          return;
        }

        signatureDataUrl = signatureRef.current
          .getTrimmedCanvas()
          .toDataURL("image/png");
      } else {
        if (!uploadedSignatureFile) {
          setSignatureErr("Please select an image file.");
          return;
        }

        signatureDataUrl = await fileToDataUrl(uploadedSignatureFile);
      }

      setSignatureBusy(true);

      const { data, error: sessErr } = await supabase.auth.getSession();
      if (sessErr) throw sessErr;

      const session = data.session;
      if (!session) {
        router.replace("/auth/signin");
        return;
      }

      const response = await fetch("/api/signatures", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          signatureDataUrl,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          [result?.error, result?.details].filter(Boolean).join(": ") ||
            "Failed to save signature.",
        );
      }

      setProfile((prev) => ({
        ...prev,
        signature_url: result.signaturePath,
      }));

      setSignaturePreviewUrl(result.signedUrl || null);

      if (signatureMode === "draw") {
        signatureRef.current?.clear();
      } else {
        setUploadedSignatureFile(null);
        setUploadFileName(null);
      }

      setSignatureMsg("Signature saved.");

      // Let the sidebar badge fetcher and the dashboard's Create Project
      // gate drop their stale "no signature" state without waiting for a
      // refetch.
      try {
        window.dispatchEvent(new Event(SIGNATURE_UPDATED_EVENT));
      } catch {}
    } catch (e: any) {
      console.error(e);
      setSignatureErr(e?.message || "Failed to save signature.");
    } finally {
      setSignatureBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      router.replace("/auth/signin?choose=1");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-white px-6 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-r-gray-200 border-b-gray-200 border-l-gray-200 border-t-[#00c065] dark:border-r-slate-600 dark:border-b-slate-600 dark:border-l-slate-600 dark:border-t-[#00c065]" />
          <p className="text-sm text-gray-600 dark:text-slate-400">Loading settings…</p>
        </div>
      </div>
    );
  }

  const phoneSelectClass =
    "h-9 w-full rounded-md border border-gray-200 bg-white px-2 pr-7 text-xs font-semibold text-gray-900 shadow-sm outline-none focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20";
  const phoneInputClass = [
    "h-9 w-full rounded-md border border-gray-200 bg-white px-2.5 text-xs text-gray-700 shadow-sm outline-none",
    "focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20",
    "sm:max-w-[240px]",
  ].join(" ");

  return (
    <div className="h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden p-4">
      <h1 className="text-xl font-semibold tracking-tight text-gray-900">Settings</h1>

      <div className="mt-4 h-[calc(100%-2.75rem)] overflow-hidden">
        <div className="h-full overflow-y-auto pr-1">
          <Card>
            <div className="grid gap-3">
              {loadErr ? (
                <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                  {loadErr}
                </div>
              ) : null}

              {/* Profile */}
              <div className="grid gap-3">
                <SectionTitle
                  title="Profile"
                  subtitle="Account details"
                  right={
                    <span
                      className={[
                        "inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                        rolePill(profile.role),
                      ].join(" ")}>
                      {roleLabel(profile.role)}
                    </span>
                  }
                />

                <div className="rounded-lg border border-gray-200 bg-white">
                  <div className="px-3 py-3">
                    <div className="grid max-w-[520px] grid-cols-[130px_1fr] gap-2.5">
                      <div className="text-xs font-medium text-gray-500">
                        Username
                      </div>
                      <div className="text-[13px] font-semibold text-gray-900">
                        {profile.username || ""}
                      </div>
                    </div>
                  </div>

                  <div className="h-px w-full bg-gray-200" />

                  {/* Signature */}
                  <div className="px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-[13px] font-semibold leading-5 text-gray-900">
                          Signature
                        </p>
                        <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
                          Used on generated documents
                        </p>
                      </div>

                      <div className="flex items-center rounded-md border border-gray-200 bg-gray-50 p-0.5 text-[11px] font-semibold">
                        {(["draw", "upload"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            onClick={() => setSignatureMode(mode)}
                            className={[
                              "rounded px-2.5 py-1 capitalize transition-colors",
                              signatureMode === mode
                                ? "bg-white text-gray-900 shadow-sm"
                                : "text-gray-500 hover:text-gray-700",
                            ].join(" ")}>
                            {mode}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-2.5 flex gap-3">
                      <div className="min-w-0 flex-1">
                        {signatureMode === "draw" ? (
                          <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
                            <SignatureCanvas
                              ref={signatureRef}
                              penColor="black"
                              canvasProps={{
                                className: "h-[84px] w-full bg-white",
                              }}
                            />
                          </div>
                        ) : (
                          <label className="flex h-[84px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-lg border border-dashed border-gray-200 bg-white transition hover:bg-gray-50">
                            <Upload className="h-4 w-4 text-gray-300" />
                            <span className="px-3 text-center text-[11px] text-gray-500">
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

                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
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
                          <p className="mt-1.5 text-[11px] font-semibold text-red-600">
                            {signatureErr}
                          </p>
                        ) : null}
                        {signatureMsg ? (
                          <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">
                            {signatureMsg}
                          </p>
                        ) : null}
                      </div>

                      <div className="w-[104px] shrink-0">
                        <p className="mb-1 text-[11px] font-medium text-gray-500">
                          Current
                        </p>
                        <div className="flex h-[84px] items-center justify-center rounded-lg border border-gray-200 bg-gray-50 p-2">
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

                  <div className="h-px w-full bg-gray-200" />

                  <div className="px-3 py-3">
                    <div className="grid max-w-[520px] grid-cols-[130px_1fr] gap-2.5">
                      <div className="text-xs font-medium text-gray-500">
                        Email
                      </div>
                      <div className="text-[13px] font-semibold text-gray-900">
                        {profile.email || ""}
                      </div>
                    </div>
                  </div>

                  <div className="h-px w-full bg-gray-200" />

                  {/* Phone */}
                  <div className="px-3 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold leading-5 text-gray-900">
                          Phone
                        </p>
                        <p className="mt-0.5 text-xs leading-5 text-gray-500">
                          Used for contact and job updates
                        </p>
                      </div>

                      {!phoneEditing ? (
                        <button
                          type="button"
                          onClick={startEditPhone}
                          className={btnNeutral}>
                          Edit
                        </button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={cancelEditPhone}
                            disabled={phoneBusy}
                            className={`${btnNeutral} disabled:opacity-60`}>
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={savePhone}
                            disabled={phoneBusy}
                            className={btnPrimary}>
                            {phoneBusy ? "Saving..." : "Save"}
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 grid gap-2">
                      {/* SAME controls in both modes so width and look match */}
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_1fr]">
                        <select
                          value={phoneDraft.countryCode}
                          onChange={(e) =>
                            setPhoneDraft((p) => ({
                              ...p,
                              countryCode: e.target.value,
                            }))
                          }
                          disabled={!phoneEditing}
                          className={`${phoneSelectClass} ${!phoneEditing ? "bg-gray-50 text-gray-900" : ""} disabled:cursor-not-allowed`}>
                          {countries.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.label}
                            </option>
                          ))}
                        </select>

                        <input
                          value={phoneDraft.local}
                          onChange={(e) =>
                            setPhoneDraft((p) => ({
                              ...p,
                              local: e.target.value,
                            }))
                          }
                          disabled={!phoneEditing}
                          inputMode="tel"
                          autoComplete="tel-national"
                          maxLength={20}
                          className={`${phoneInputClass} ${!phoneEditing ? "bg-gray-50 text-gray-900" : ""} disabled:cursor-not-allowed`}
                          placeholder="9xx xxx xxxx"
                        />
                      </div>

                      {phoneErr ? (
                        <p className="text-[11px] font-semibold text-red-600">
                          {phoneErr}
                        </p>
                      ) : null}
                      {phoneMsg ? (
                        <p className="text-[11px] font-semibold text-emerald-700">
                          {phoneMsg}
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Project Time */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-200" />
                <div className="mt-4 grid gap-2.5">
                  <SectionTitle
                    title="Project Time"
                    subtitle="Choose whether project progress uses live time or a simulated reference."
                  />

                  <div className="settings-compact-scope">
                    <ProjectTimeReferenceSettings />
                  </div>

                  {/* Admin-only auto-start toggle. Hidden for managers /
                      staff / clients — they shouldn't be able to opt the
                      whole org-flavoured browser into background status
                      changes from this UI. */}
                  {profile.role === "admin" ? (
                    <div className="settings-compact-scope">
                      <AutoStartProjectsToggle />
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Schedule */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-200" />
                <div className="mt-4 grid gap-2.5">
                  <SectionTitle
                    title="Schedule"
                    subtitle="Configure how the schedule and project schedule modal treat non-working days."
                  />

                  <div className="settings-compact-scope">
                    <HolidaySettings />
                  </div>
                </div>
              </div>

              {/* Advanced Settings */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-200" />
                <div className="mt-4 grid gap-2.5">
                  <SectionTitle
                    title="Advanced Settings"
                    subtitle="Manage workflow configuration and estimation rules used across admin planning."
                  />

                  <div className="grid gap-2.5 lg:grid-cols-2">
                    <SettingsNavigationCard
                      title="Task Management"
                      description="Update main tasks, subtasks, replacements, and default resources."
                      icon={Wrench}
                      onClick={() =>
                        router.push("/admin/settings/task-management")
                      }
                    />

                    <SettingsNavigationCard
                      title="Edit Estimations"
                      description="Manage estimation formulas, variables, and preview rules."
                      icon={Calculator}
                      onClick={() =>
                        router.push("/admin/settings/edit-estimations")
                      }
                    />
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-200" />
                <div className="mt-4 grid gap-2.5">
                  <SectionTitle
                    title="Appearance"
                    subtitle="Control the look and feel of the interface."
                  />

                  <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
                    <div>
                      <p className="text-[13px] font-semibold leading-5 text-gray-900">
                        Dark mode
                      </p>
                      <p className="mt-0.5 text-xs leading-5 text-gray-500">
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
              <div className="pt-1">
                <div className="h-px w-full bg-gray-200" />
                <div className="mt-4 grid gap-2.5">
                  <SectionTitle
                    title="Session"
                    subtitle="Sign out of your account on this device."
                  />

                  <div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={btnDanger}>
                      Logout
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <style jsx global>{`
        canvas {
          touch-action: none;
        }

        .settings-compact-scope > div {
          padding: 0.75rem !important;
          border-radius: 0.5rem !important;
        }

        .settings-compact-scope [class~="p-6"],
        .settings-compact-scope [class~="p-5"],
        .settings-compact-scope [class~="p-4"] {
          padding: 0.75rem !important;
        }

        .settings-compact-scope [class~="px-6"],
        .settings-compact-scope [class~="px-5"],
        .settings-compact-scope [class~="px-4"] {
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
        }

        .settings-compact-scope [class~="py-5"],
        .settings-compact-scope [class~="py-4"] {
          padding-top: 0.6rem !important;
          padding-bottom: 0.6rem !important;
        }

        .settings-compact-scope [class~="gap-5"],
        .settings-compact-scope [class~="gap-4"] {
          gap: 0.65rem !important;
        }

        .settings-compact-scope [class~="mt-5"],
        .settings-compact-scope [class~="mt-4"] {
          margin-top: 0.65rem !important;
        }

        .settings-compact-scope h1,
        .settings-compact-scope h2,
        .settings-compact-scope h3,
        .settings-compact-scope h4,
        .settings-compact-scope [class~="text-lg"],
        .settings-compact-scope [class~="text-xl"] {
          font-size: 0.875rem !important;
          line-height: 1.2rem !important;
        }

        .settings-compact-scope p,
        .settings-compact-scope span,
        .settings-compact-scope label,
        .settings-compact-scope button,
        .settings-compact-scope input {
          font-size: 0.75rem !important;
          line-height: 1rem !important;
        }

        .settings-compact-scope [class~="text-sm"] {
          font-size: 0.75rem !important;
          line-height: 1rem !important;
        }

        .settings-compact-scope [class~="text-xs"] {
          font-size: 0.6875rem !important;
          line-height: 0.95rem !important;
        }

        .settings-compact-scope input,
        .settings-compact-scope select,
        .settings-compact-scope button {
          min-height: 0 !important;
        }

        .settings-compact-scope input,
        .settings-compact-scope select {
          height: 2rem !important;
          padding-top: 0.3rem !important;
          padding-bottom: 0.3rem !important;
        }

        .settings-compact-scope button {
          height: 2rem !important;
          padding-top: 0.3rem !important;
          padding-bottom: 0.3rem !important;
        }

        .settings-compact-scope .h-12,
        .settings-compact-scope [class~="h-12"] {
          height: 2rem !important;
        }

        .settings-compact-scope .h-10,
        .settings-compact-scope [class~="h-10"] {
          height: 1.875rem !important;
        }
      `}</style>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="h-1 w-full" style={{ backgroundColor: ACCENT }} />
      <div className="p-3.5">{children}</div>
    </div>
  );
}

function SettingsNavigationCard({
  title,
  description,
  icon: Icon,
  onClick,
}: {
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#00c065]/30 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#00c065]/20">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[#00c065]">
        <Icon className="h-4 w-4" />
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-5 text-gray-900">{title}</p>
        <p className="mt-0.5 text-xs leading-5 text-gray-500">{description}</p>
      </div>

      <ChevronRight className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[#00c065]" />
    </button>
  );
}

