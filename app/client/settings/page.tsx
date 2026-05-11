"use client";

import React, { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import ProjectTimeReferenceSettings from "@/components/settings/projectTimeReferenceSettings";

const ACCENT = "#00c065";

type ClientSettingsResponse = {
  accessMode: "auth" | "project";
  error?: string;
  details?: string;
};

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
        <div className="flex items-center gap-1.5">
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: ACCENT }}
            aria-hidden="true"
          />
          <p className="text-[13px] font-semibold text-gray-900">{title}</p>
        </div>
        {subtitle ? (
          <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
            {subtitle}
          </p>
        ) : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

const btnBase =
  "inline-flex items-center justify-center rounded-md text-xs font-semibold shadow-sm transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#00c065]/25";
const btnNeutral = `${btnBase} border border-gray-200 bg-white h-8 px-3 text-gray-900 hover:bg-gray-50 hover:shadow-md`;
const btnDanger = `${btnBase} border border-red-200 bg-white h-8 px-3 text-red-600 hover:bg-red-50 hover:shadow-md`;

export default function ClientSettings() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [accessMode, setAccessMode] = useState<"auth" | "project">("auth");

  // We still call /api/client/settings on mount because the Session
  // panel below needs to know whether the user is signed in normally
  // ("auth") or via a project-cookie access token ("project") so the
  // logout button can copy the right thing. Other fields the endpoint
  // returns (profile, canEditPhone, etc.) are intentionally ignored —
  // the Profile section was removed from this page.
  useEffect(() => {
    const boot = async () => {
      setLoading(true);
      setLoadErr(null);

      try {
        const response = await fetch("/api/client/settings", {
          cache: "no-store",
        });
        const data = (await response
          .json()
          .catch(() => null)) as ClientSettingsResponse | null;

        if (response.status === 401) {
          router.replace("/auth/signin");
          return;
        }

        if (!response.ok) {
          throw new Error(
            [data?.error, data?.details].filter(Boolean).join(" ") ||
              "Failed to load settings.",
          );
        }

        if (data?.accessMode) {
          setAccessMode(data.accessMode);
        }
      } catch (error: unknown) {
        console.error(error);
        setLoadErr(
          error instanceof Error ? error.message : "Failed to load settings.",
        );
      } finally {
        setLoading(false);
      }
    };

    boot();
  }, [router]);

  const handleLogout = async () => {
    try {
      await Promise.allSettled([
        supabase.auth.signOut(),
        fetch("/api/auth/client-access", { method: "DELETE" }),
      ]);

      try {
        localStorage.removeItem("paintpro_client_access");
        sessionStorage.removeItem("paintpro_client_access");
      } catch {}

      document.cookie =
        "paintpro_client_access=; Max-Age=0; Path=/; SameSite=Strict";
      router.replace("/auth/signin?choose=1");
    } catch (error) {
      console.error("Error signing out:", error);
    }
  };

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-white px-6 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-r-gray-200 border-b-gray-200 border-l-gray-200 border-t-[#00c065] dark:border-r-slate-600 dark:border-b-slate-600 dark:border-l-slate-600 dark:border-t-[#00c065]" />
          <p className="text-xs text-gray-500 dark:text-slate-400">Loading settings…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-[calc(100vh-var(--admin-header-offset,0px))] overflow-hidden p-4">
      <h1 className="text-xl font-semibold tracking-tight text-gray-900">
        Settings
      </h1>

      <div className="mt-4 h-[calc(100%-2.75rem)] overflow-hidden">
        <div className="h-full overflow-y-auto pr-1">
          <Card>
            <div className="grid gap-4">
              {loadErr ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-700">
                  {loadErr}
                </div>
              ) : null}

              {/* Project Time */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-100" />
                <div className="mt-3 grid gap-2.5">
                  <SectionTitle
                    title="Project Time"
                    subtitle="Choose whether project progress uses live time or a simulated reference."
                  />

                  <div className="client-settings-compact-scope">
                    <ProjectTimeReferenceSettings />
                  </div>
                </div>
              </div>

              {/* Appearance */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-100" />
                <div className="mt-3 grid gap-2.5">
                  <SectionTitle
                    title="Appearance"
                    subtitle="Control the look and feel of the interface."
                  />

                  <div className="flex items-center justify-between gap-3 rounded-md border border-gray-200 bg-white px-3 py-2.5 shadow-sm">
                    <div>
                      <p className="text-[13px] font-semibold text-gray-900">
                        Dark mode
                      </p>
                      <p className="mt-0.5 text-[11px] leading-4 text-gray-500">
                        Switch between light and dark interface.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setTheme(isDark ? "light" : "dark")}
                      className={btnNeutral}
                    >
                      {isDark ? "Light mode" : "Dark mode"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Session */}
              <div className="pt-1">
                <div className="h-px w-full bg-gray-100" />
                <div className="mt-3 grid gap-2.5">
                  <SectionTitle
                    title="Session"
                    subtitle={
                      accessMode === "project"
                        ? "Remove this project access from this device."
                        : "Sign out of your account on this device."
                    }
                  />

                  <div>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className={btnDanger}
                    >
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
        .client-settings-compact-scope > * {
          font-size: 12px;
        }

        .client-settings-compact-scope h1,
        .client-settings-compact-scope h2,
        .client-settings-compact-scope h3,
        .client-settings-compact-scope [class*="text-lg"] {
          font-size: 13px !important;
          line-height: 1.25rem !important;
        }

        .client-settings-compact-scope p,
        .client-settings-compact-scope span,
        .client-settings-compact-scope label,
        .client-settings-compact-scope button,
        .client-settings-compact-scope input,
        .client-settings-compact-scope select {
          font-size: 11px !important;
          line-height: 1rem !important;
        }

        .client-settings-compact-scope [class*="p-6"] {
          padding: 0.75rem !important;
        }
        .client-settings-compact-scope [class*="p-5"] {
          padding: 0.75rem !important;
        }
        .client-settings-compact-scope [class*="p-4"] {
          padding: 0.625rem !important;
        }
        .client-settings-compact-scope [class*="py-4"] {
          padding-top: 0.625rem !important;
          padding-bottom: 0.625rem !important;
        }
        .client-settings-compact-scope [class*="px-4"] {
          padding-left: 0.75rem !important;
          padding-right: 0.75rem !important;
        }
        .client-settings-compact-scope [class*="gap-6"] {
          gap: 0.75rem !important;
        }
        .client-settings-compact-scope [class*="gap-5"] {
          gap: 0.75rem !important;
        }
        .client-settings-compact-scope [class*="gap-4"] {
          gap: 0.625rem !important;
        }
        .client-settings-compact-scope input,
        .client-settings-compact-scope select,
        .client-settings-compact-scope button {
          min-height: 2rem !important;
        }
      `}</style>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
      <div className="h-0.5 w-full" style={{ backgroundColor: ACCENT }} />
      <div className="p-3">{children}</div>
    </div>
  );
}
