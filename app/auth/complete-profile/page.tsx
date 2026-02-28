"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabaseClient";

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { ChevronDown, Phone, User } from "lucide-react";

import rawCountries from "@/app/data/country-by-calling-code.json";

type Role = "client" | "staff";

type CountryRaw = {
  country: string;
  calling_code: number;
};

type CountryOption = {
  label: string; // "Philippines (+63)"
  code: string; // "+63"
};

export default function CompleteProfilePage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [role, setRole] = useState<Role>("client");
  const [username, setUsername] = useState("");

  // Country list
  const countries: CountryOption[] = useMemo(() => {
    return (rawCountries as CountryRaw[])
      .filter((c) => c?.country && Number.isFinite(c.calling_code))
      .map((c) => ({
        label: `${c.country} (+${c.calling_code})`,
        code: `+${c.calling_code}`,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, []);

  const defaultCountry = useMemo(() => {
    const ph = countries.find((c) => c.code === "+63");
    return ph ?? countries[0] ?? { label: "Philippines (+63)", code: "+63" };
  }, [countries]);

  const [countryCode, setCountryCode] = useState<string>("+63");
  const [countryLabel, setCountryLabel] = useState<string>("Philippines (+63)");

  // Phone is local digits only, like signup page
  const [phone, setPhone] = useState<string>("");

  const normalizeDigits = (raw: string) => raw.replace(/[^\d]/g, "").trim();

  const fullPhone = useMemo(() => {
    const localDigits = normalizeDigits(phone);
    if (!localDigits) return "";
    return `${countryCode} ${localDigits}`.trim();
  }, [phone, countryCode]);

  const parseStoredPhone = (stored: string | null | undefined) => {
    if (!stored) return null;

    // Try to find a matching country code at the start, then extract digits remainder.
    // Example: "+63 9123456789"
    const trimmed = stored.trim();
    const match = trimmed.match(/^(\+\d+)\s*(.*)$/);
    if (!match) {
      // If it's only digits, treat as local
      return { code: countryCode, local: normalizeDigits(trimmed) };
    }

    const code = match[1];
    const rest = match[2] ?? "";
    return { code, local: normalizeDigits(rest) };
  };

  useEffect(() => {
    // Initialize dropdown to default PH (or first) immediately
    setCountryCode(defaultCountry.code);
    setCountryLabel(defaultCountry.label);
  }, [defaultCountry.code, defaultCountry.label]);

  useEffect(() => {
    const init = async () => {
      try {
        setError("");

        const { data, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr) throw sessionErr;

        if (!data.session) {
          router.replace("/auth/signin");
          return;
        }

        const userId = data.session.user.id;

        // DB profile
        const { data: profile, error: pErr } = await supabase
          .from("users")
          .select("username, phone, role")
          .eq("id", userId)
          .maybeSingle();

        if (pErr) throw pErr;

        // Prefill from localStorage first (values chosen on signup page before redirect)
        let prefill: any = null;
        try {
          const raw = localStorage.getItem("paintpro_oauth_prefill");
          if (raw) prefill = JSON.parse(raw);
        } catch {}

        // Role
        const candidateRole = prefill?.role ?? profile?.role;
        if (candidateRole === "client" || candidateRole === "staff") {
          setRole(candidateRole);
        }

        // Username
        const candidateUsername = (prefill?.username ?? profile?.username ?? "").toString().trim();
        if (candidateUsername) setUsername(candidateUsername);

        // Phone + country
        const candidatePhone = (prefill?.phone ?? profile?.phone ?? "").toString().trim();

        if (candidatePhone) {
          const parsed = parseStoredPhone(candidatePhone);
          if (parsed?.code) {
            const found = countries.find((c) => c.code === parsed.code);
            if (found) {
              setCountryCode(found.code);
              setCountryLabel(found.label);
            } else {
              setCountryCode(parsed.code);
              setCountryLabel(parsed.code);
            }
          }
          if (parsed?.local) setPhone(parsed.local);
        } else {
          // If no phone, still try to set prefill country values
          const cCode = prefill?.countryCode;
          const cLabel = prefill?.countryLabel;
          if (typeof cCode === "string" && cCode.startsWith("+")) setCountryCode(cCode);
          if (typeof cLabel === "string" && cLabel) setCountryLabel(cLabel);
        }

        setLoading(false);
      } catch (e) {
        console.error(e);
        setLoading(false);
      }
    };

    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, countries.length]);

  const save = async () => {
    setError("");

    const u = username.trim();
    const localDigits = normalizeDigits(phone);

    if (!u) {
      setError("Please enter a username.");
      return;
    }

    // Optional: validate phone only if user entered something
    if (phone.trim() && localDigits.length < 7) {
      setError("Please enter a valid phone number.");
      return;
    }

    try {
      setSaving(true);

      const { data, error: sessionErr } = await supabase.auth.getSession();
      if (sessionErr) throw sessionErr;

      if (!data.session) {
        router.replace("/auth/signin");
        return;
      }

      const userId = data.session.user.id;

      const nextStatus = role === "staff" ? "pending" : "active";

      const { error: upErr } = await supabase
        .from("users")
        .update({
          role,
          status: nextStatus,
          username: u,
          phone: fullPhone || null,
        })
        .eq("id", userId);

      if (upErr) throw upErr;

      try {
        localStorage.removeItem("paintpro_oauth_prefill");
      } catch {}

      if (nextStatus === "pending") {
        router.replace("/auth/pending");
        return;
      }

      router.replace(role === "staff" ? "/staff" : "/client");
    } catch (e: any) {
      console.error(e);
      setError(e?.message || "Failed to save profile. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-white px-6">
        <div className="flex flex-col items-center gap-6 text-center">
          <Image src="/paint_pro_logo.png" alt="PaintPro" width={90} height={90} priority />
          <div className="h-12 w-12 rounded-full border-4 border-gray-200 border-t-[#00c065] animate-spin" />
          <p className="text-sm text-gray-600">Preparing your profile…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-white px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-[520px]">
        <div className="flex items-center gap-4 mb-8">
          <Image src="/paint_pro_logo.png" alt="PaintPro" width={72} height={72} priority />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Complete your profile</h1>
            <p className="text-sm text-gray-600">Choose your role and confirm your details.</p>
          </div>
        </div>

        <div className="grid gap-5">
          {/* Role */}
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-gray-900">Role</label>
            <div className="grid grid-cols-2 gap-2">
              {(["client", "staff"] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRole(r)}
                  className={[
                    "rounded-lg border px-3 py-2 text-sm font-semibold capitalize transition",
                    role === r
                      ? "border-[#00c065] bg-[#00c065]/10 text-gray-900"
                      : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50",
                  ].join(" ")}
                >
                  {r}
                </button>
              ))}
            </div>

            <p className="text-[12px] text-gray-600">
              {role === "staff"
                ? "Staff accounts may require approval."
                : "Client accounts are activated immediately."}
            </p>
          </div>

          {/* Username */}
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-gray-900">Username</label>
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                placeholder="e.g. John Doe"
              />
            </div>
          </div>

          {/* Phone with country code picker */}
          <div className="grid gap-2">
            <label className="text-sm font-semibold text-gray-900">Phone (optional)</label>

            <div className="grid grid-cols-[90px_minmax(0,1fr)] gap-2">
              <DropdownMenu.Root>
                <DropdownMenu.Trigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-11 w-full items-center justify-between rounded-lg border border-gray-200 bg-white px-3 text-sm font-semibold text-gray-700 shadow-sm outline-none transition hover:bg-gray-50 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                    aria-label="Select country code"
                  >
                    <span className="truncate">{countryCode}</span>
                    <ChevronDown className="h-4 w-4 text-gray-500" />
                  </button>
                </DropdownMenu.Trigger>

                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="start"
                    sideOffset={8}
                    className="z-50 max-h-80 min-w-[280px] overflow-auto rounded-lg border border-gray-200 bg-white p-1 shadow-lg"
                  >
                    {countries.map((c) => (
                      <DropdownMenu.Item
                        key={c.code + c.label}
                        onSelect={() => {
                          setCountryLabel(c.label);
                          setCountryCode(c.code);
                        }}
                        className="flex cursor-pointer items-center justify-between rounded-lg px-3 py-2 text-sm text-gray-700 outline-none hover:bg-gray-50 data-highlighted:bg-gray-50"
                      >
                        <span className="truncate">{c.label}</span>
                        {countryCode === c.code ? (
                          <span className="ml-3 text-xs font-semibold text-[#00c065]">
                            Selected
                          </span>
                        ) : null}
                      </DropdownMenu.Item>
                    ))}
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>

              <div className="relative">
                <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="9XX XXX XXXX"
                  className="h-11 w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3.5 text-sm text-gray-800 shadow-sm outline-none placeholder:text-gray-400 focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20"
                />
              </div>
            </div>

            <p className="min-h-4 text-[11px] leading-4 text-gray-500">
              Saved as: <span className="font-semibold">{fullPhone || "…"}</span>
            </p>
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-[#00c065] px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-[#00a054] disabled:opacity-60 disabled:cursor-not-allowed transition"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
        </div>
      </div>
    </div>
  );
}
