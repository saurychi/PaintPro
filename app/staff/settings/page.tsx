"use client";

import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import rawCountries from "@/lib/data/country-by-calling-code.json";
import ProjectTimeReferenceSettings from "@/components/settings/projectTimeReferenceSettings";

const ACCENT = "#00c065";

type CountryRaw = { country: string; calling_code: number };
type CountryOption = { label: string; code: string };

type DbUser = {
  id: string;
  username: string;
  email: string | null;
  phone: string | null;
  role: "client" | "staff" | "manager" | "admin";
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
  });

  const [phoneEditing, setPhoneEditing] = useState(false);
  const [phoneBusy, setPhoneBusy] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState<string | null>(null);
  const [phoneErr, setPhoneErr] = useState<string | null>(null);

  const [phoneDraft, setPhoneDraft] = useState({
    countryCode: "+63",
    local: "",
  });


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
          .select("id, username, email, phone, role")
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
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin dark:border-slate-500 dark:border-t-[#00c065]" />
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
    <div className="min-h-[calc(100vh-var(--admin-header-offset,0px))] p-3 sm:p-4 lg:h-[calc(100vh-var(--admin-header-offset,0px))] lg:overflow-hidden">
      <h1 className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl">Settings</h1>

      <div className="mt-3 sm:mt-4 lg:h-[calc(100%-2.75rem)] lg:overflow-hidden">
        <div className="pr-0 lg:h-full lg:overflow-y-auto lg:pr-1">
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
