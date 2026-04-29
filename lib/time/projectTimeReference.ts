export const PROJECT_TIME_REFERENCE_COOKIE = "paintpro_project_time_reference";
export const PROJECT_TIME_REFERENCE_EVENT =
  "paintpro:project-time-reference-change";

const ONE_YEAR_IN_SECONDS = 60 * 60 * 24 * 365;

function isValidDate(date: Date) {
  return !Number.isNaN(date.getTime());
}

export function normalizeProjectTimeReferenceIso(
  value?: string | null,
): string | null {
  if (!value) return null;

  const trimmed = String(value).trim();
  if (!trimmed) return null;

  const parsed = new Date(trimmed);
  if (!isValidDate(parsed)) return null;

  return parsed.toISOString();
}

export function parseProjectTimeReferenceInput(
  value?: string | null,
): string | null {
  return normalizeProjectTimeReferenceIso(value);
}

export function formatProjectTimeReferenceInputValue(
  value?: string | Date | null,
): string {
  const parsed =
    value instanceof Date
      ? value
      : value
        ? new Date(value)
        : new Date();

  const safeDate = isValidDate(parsed) ? parsed : new Date();
  const localTime = new Date(
    safeDate.getTime() - safeDate.getTimezoneOffset() * 60 * 1000,
  );

  return localTime.toISOString().slice(0, 16);
}

export function formatProjectTimeReferenceLabel(
  value?: string | Date | null,
): string {
  const parsed =
    value instanceof Date
      ? value
      : value
        ? new Date(value)
        : null;

  if (!parsed || !isValidDate(parsed)) return "Live system time";

  return parsed.toLocaleString("en-US", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function resolveProjectTimeReferenceDate(
  value?: string | null,
): Date | null {
  const normalized = normalizeProjectTimeReferenceIso(value);
  return normalized ? new Date(normalized) : null;
}

export function buildProjectTimeReferenceCookie(iso: string) {
  return [
    `${PROJECT_TIME_REFERENCE_COOKIE}=${encodeURIComponent(iso)}`,
    "Path=/",
    `Max-Age=${ONE_YEAR_IN_SECONDS}`,
    "SameSite=Strict",
  ].join("; ");
}

export function buildClearProjectTimeReferenceCookie() {
  return [
    `${PROJECT_TIME_REFERENCE_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "SameSite=Strict",
  ].join("; ");
}

export function readCookieValue(
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

export function readProjectTimeReferenceFromCookieString(
  cookieString: string | null | undefined,
): string | null {
  return normalizeProjectTimeReferenceIso(
    readCookieValue(cookieString, PROJECT_TIME_REFERENCE_COOKIE),
  );
}
