export const HOLIDAY_SETTINGS_COOKIE = "paintpro_holiday_settings";
export const HOLIDAY_SETTINGS_EVENT = "paintpro:holiday-settings-change";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

export type HolidaySettings = {
  enabled: boolean;
  countryCode: string;
};

export const DEFAULT_HOLIDAY_SETTINGS: HolidaySettings = {
  enabled: true,
  countryCode: "AU",
};

const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

export function normalizeHolidaySettings(
  value: unknown,
): HolidaySettings {
  if (!value || typeof value !== "object") return DEFAULT_HOLIDAY_SETTINGS;

  const raw = value as Partial<HolidaySettings>;
  const countryCode = String(raw.countryCode ?? "").toUpperCase();

  return {
    enabled: Boolean(raw.enabled),
    countryCode: COUNTRY_CODE_PATTERN.test(countryCode)
      ? countryCode
      : DEFAULT_HOLIDAY_SETTINGS.countryCode,
  };
}

export function buildHolidaySettingsCookie(settings: HolidaySettings) {
  const encoded = encodeURIComponent(JSON.stringify(settings));
  return [
    `${HOLIDAY_SETTINGS_COOKIE}=${encoded}`,
    "Path=/",
    `Max-Age=${ONE_YEAR_IN_SECONDS}`,
    "SameSite=Strict",
  ].join("; ");
}

function readCookieValue(
  cookieString: string | null | undefined,
  name: string,
): string | null {
  if (!cookieString) return null;

  const segments = cookieString.split(";");
  for (const segment of segments) {
    const [rawName, ...rawValueParts] = segment.trim().split("=");
    if (rawName !== name) continue;
    const rawValue = rawValueParts.join("=");
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

export function readHolidaySettingsFromCookieString(
  cookieString: string | null | undefined,
): HolidaySettings {
  const raw = readCookieValue(cookieString, HOLIDAY_SETTINGS_COOKIE);
  if (!raw) return DEFAULT_HOLIDAY_SETTINGS;

  try {
    return normalizeHolidaySettings(JSON.parse(raw));
  } catch {
    return DEFAULT_HOLIDAY_SETTINGS;
  }
}
