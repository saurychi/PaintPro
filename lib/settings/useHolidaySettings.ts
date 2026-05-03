"use client";

import { useCallback, useEffect, useState } from "react";
import {
  buildHolidaySettingsCookie,
  DEFAULT_HOLIDAY_SETTINGS,
  HOLIDAY_SETTINGS_EVENT,
  HolidaySettings,
  normalizeHolidaySettings,
  readHolidaySettingsFromCookieString,
} from "./holidaySettings";

function readBrowserHolidaySettings(): HolidaySettings {
  if (typeof document === "undefined") return DEFAULT_HOLIDAY_SETTINGS;
  return readHolidaySettingsFromCookieString(document.cookie);
}

function dispatchHolidaySettingsChange(settings: HolidaySettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(HOLIDAY_SETTINGS_EVENT, { detail: settings }),
  );
}

export function useHolidaySettings() {
  const [settings, setSettings] = useState<HolidaySettings>(
    DEFAULT_HOLIDAY_SETTINGS,
  );
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSettings(readBrowserHolidaySettings());
      setIsLoaded(true);
    };

    sync();

    if (typeof window === "undefined") return;

    const handleChange = () => sync();
    window.addEventListener(
      HOLIDAY_SETTINGS_EVENT,
      handleChange as EventListener,
    );

    return () => {
      window.removeEventListener(
        HOLIDAY_SETTINGS_EVENT,
        handleChange as EventListener,
      );
    };
  }, []);

  const saveSettings = useCallback((next: Partial<HolidaySettings>) => {
    if (typeof document === "undefined") return null;

    const merged = normalizeHolidaySettings({
      ...readBrowserHolidaySettings(),
      ...next,
    });

    document.cookie = buildHolidaySettingsCookie(merged);
    setSettings(merged);
    setIsLoaded(true);
    dispatchHolidaySettingsChange(merged);

    return merged;
  }, []);

  return {
    settings,
    isLoaded,
    saveSettings,
  };
}
