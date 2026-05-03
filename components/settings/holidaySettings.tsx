"use client";

import { useEffect, useMemo, useState } from "react";
import { useHolidaySettings } from "@/lib/settings/useHolidaySettings";

const btnBase =
  "inline-flex items-center justify-center rounded-lg text-sm font-semibold shadow-sm transition-all duration-200 ease-out active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#00c065]/25";
const btnPrimary = `${btnBase} bg-[#00c065] px-3 h-9 text-white hover:bg-[#00a054] hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60`;

type CountryOption = { code: string; name: string };

export default function HolidaySettings() {
  const { settings, isLoaded, saveSettings } = useHolidaySettings();

  const [countries, setCountries] = useState<CountryOption[]>([]);
  const [countriesLoading, setCountriesLoading] = useState(true);
  const [countriesError, setCountriesError] = useState<string | null>(null);

  const [draftEnabled, setDraftEnabled] = useState(settings.enabled);
  const [draftCountry, setDraftCountry] = useState(settings.countryCode);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    setDraftEnabled(settings.enabled);
    setDraftCountry(settings.countryCode);
  }, [isLoaded, settings.enabled, settings.countryCode]);

  useEffect(() => {
    let cancelled = false;

    async function loadCountries() {
      try {
        setCountriesLoading(true);
        setCountriesError(null);

        const response = await fetch("/api/holidays/countries", {
          method: "GET",
        });
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data?.error || "Failed to load supported countries.");
        }

        if (cancelled) return;

        const next: CountryOption[] = Array.isArray(data?.countries)
          ? data.countries
          : [];
        setCountries(next);
      } catch (err) {
        if (cancelled) return;
        setCountriesError(
          err instanceof Error ? err.message : "Failed to load countries.",
        );
        setCountries([]);
      } finally {
        if (!cancelled) setCountriesLoading(false);
      }
    }

    loadCountries();

    return () => {
      cancelled = true;
    };
  }, []);

  const activeCountryName = useMemo(() => {
    const match = countries.find((c) => c.code === settings.countryCode);
    return match?.name ?? settings.countryCode;
  }, [countries, settings.countryCode]);

  const handleToggle = () => {
    setError(null);
    setMessage(null);
    setDraftEnabled((current) => !current);
  };

  const handleSave = () => {
    setError(null);
    setMessage(null);

    if (draftEnabled && !draftCountry) {
      setError("Choose a country to load holidays for.");
      return;
    }

    saveSettings({
      enabled: draftEnabled,
      countryCode: draftCountry,
    });

    setMessage(
      draftEnabled
        ? "Holidays will now be marked as unavailable on calendars."
        : "Holidays are no longer applied to the schedule.",
    );
  };

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900">
            Include holidays
          </p>
          <p className="mt-1 text-sm text-gray-600">
            Block out public holidays for the selected country across the
            schedule page and the project schedule modal.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={draftEnabled}
            onClick={handleToggle}
            className={[
              "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-[#00c065]/25",
              draftEnabled ? "bg-[#00c065]" : "bg-gray-300",
            ].join(" ")}>
            <span
              className={[
                "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform",
                draftEnabled ? "translate-x-5" : "translate-x-0.5",
              ].join(" ")}
            />
          </button>
          <span className="text-sm font-semibold text-gray-900">
            {draftEnabled ? "On" : "Off"}
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3">
        <div className="grid gap-2 sm:max-w-[320px]">
          <label
            htmlFor="holiday-country"
            className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">
            Country
          </label>
          <select
            id="holiday-country"
            value={draftCountry}
            disabled={!draftEnabled || countriesLoading}
            onChange={(event) => setDraftCountry(event.target.value)}
            className={[
              "h-10 w-full rounded-lg border border-gray-200 bg-white px-3 pr-8 text-sm text-gray-700 shadow-sm outline-none",
              "focus:border-[#00c065] focus:ring-2 focus:ring-[#00c065]/20",
              !draftEnabled || countriesLoading
                ? "cursor-not-allowed bg-gray-50 text-gray-400"
                : "",
            ].join(" ")}>
            {countriesLoading ? (
              <option value={draftCountry}>Loading countries…</option>
            ) : countries.length === 0 ? (
              <option value={draftCountry}>{draftCountry}</option>
            ) : (
              countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name} ({c.code})
                </option>
              ))
            )}
          </select>

          {countriesError ? (
            <p className="text-xs font-semibold text-red-600">
              {countriesError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={handleSave} className={btnPrimary}>
            Save
          </button>
        </div>

        <div className="rounded-lg border border-emerald-100 bg-emerald-50/60 px-3 py-2 text-sm text-emerald-900">
          <span className="font-semibold">Active mode:</span>{" "}
          {settings.enabled
            ? `Holidays from ${activeCountryName}`
            : "Holidays off"}
        </div>

        <p className="text-xs text-gray-500">
          Holiday data is fetched from the public Nager.Date API and cached on
          the server for 24 hours.
        </p>

        {error ? (
          <p className="text-sm font-semibold text-red-600">{error}</p>
        ) : null}
        {message ? (
          <p className="text-sm font-semibold text-emerald-700">{message}</p>
        ) : null}
      </div>
    </div>
  );
}
