import { fakeDelay } from "./_shared"
import { supabase } from "@/lib/supabaseClient"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type UserRole = "client" | "staff" | "manager" | "admin"

/** The user profile row from the public.users table */
export type UserProfile = {
  id: string
  username: string
  email: string | null
  phone: string | null
  role: UserRole
  firstName: string | null
  lastName: string | null
}

/** Notification/behavior preference toggles stored per user */
export type UserPreferences = {
  jobUpdates: boolean
  messages: boolean
  autoDownload: boolean
  assignEmployees: boolean
}

export type SavePhoneParams = {
  userId: string
  phone: string | null  // full formatted phone, e.g. "+63 912 345 6789" or null to clear
}

export type SaveProfileParams = {
  userId: string
  firstName: string
  lastName: string
  email: string
  phone: string
}

export type ChangePasswordParams = {
  newPassword: string
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export const DEFAULT_PREFERENCES: UserPreferences = {
  jobUpdates: false,
  messages: true,
  autoDownload: true,
  assignEmployees: true,
}

// ---------------------------------------------------------------------------
// Phone Utilities  (shared across admin / client / staff settings pages)
// ---------------------------------------------------------------------------

export function parsePhone(raw?: string | null): { countryCode: string; local: string } {
  const fallback = { countryCode: "+63", local: "" }
  if (!raw) return fallback
  const s = String(raw).trim()
  const m = s.match(/^(\+\d+)\s*(.*)$/)
  if (!m) return { ...fallback, local: s }
  return { countryCode: m[1], local: (m[2] || "").trim() }
}

export function formatPhoneFull(countryCode: string, local: string): string | null {
  const cc = countryCode.trim()
  const lc = local.trim()
  if (!lc) return null
  return `${cc} ${lc}`
}

// ---------------------------------------------------------------------------
// Role UI Helpers  (shared across settings pages and layout headers)
// ---------------------------------------------------------------------------

export function getRolePillClasses(role: UserRole): string {
  if (role === "admin")   return "border-gray-200 bg-gray-100 text-gray-800"
  if (role === "manager") return "border-purple-200 bg-purple-500/10 text-purple-700"
  if (role === "staff")   return "border-blue-200 bg-blue-500/10 text-blue-700"
  return "border-emerald-200 bg-emerald-500/10 text-emerald-700"
}

export function getRoleLabel(role: UserRole): string {
  if (role === "admin")   return "Admin"
  if (role === "manager") return "Manager"
  if (role === "staff")   return "Staff"
  return "Client"
}

// ---------------------------------------------------------------------------
// Public API – reads real Supabase data where possible, dummy elsewhere
// ---------------------------------------------------------------------------

/**
 * Load the current session and profile from Supabase.
 * Returns null if there is no active session (caller should redirect to sign-in).
 *
 * Later: fetching preferences from a separate user_preferences table can be
 * added here once that table exists; for now preferences are kept in local state.
 */
export async function getCurrentUserProfile(): Promise<UserProfile | null> {
  const { data, error: sessErr } = await supabase.auth.getSession()
  if (sessErr) console.error("[settings.repo] session error:", sessErr)

  const session = data.session
  if (!session) return null

  const { data: row, error } = await supabase
    .from("users")
    .select("id, username, email, phone, role")
    .eq("id", session.user.id)
    .maybeSingle<{
      id: string
      username: string
      email: string | null
      phone: string | null
      role: UserRole
    }>()

  if (error) throw error
  if (!row) return null

  // Merge auth email as fallback for the profile email
  const mergedEmail = row.email ?? (session.user.email || null)

  return {
    ...row,
    email: mergedEmail,
    firstName: null,   // Later: pull from users table once columns exist
    lastName: null,
  }
}

/**
 * Save an updated phone number for a user.
 * Writes directly to public.users in Supabase.
 */
export async function savePhone(params: SavePhoneParams): Promise<void> {
  const { error } = await supabase
    .from("users")
    .update({ phone: params.phone, updated_at: new Date().toISOString() })
    .eq("id", params.userId)

  if (error) throw error
}

/**
 * Save an updated profile (first name, last name, email, phone).
 * Later: expand to include columns once they exist in the DB schema.
 */
export async function saveProfile(params: SaveProfileParams): Promise<void> {
  // Dummy values (later: swap to Supabase update once firstName/lastName columns exist)
  await fakeDelay(300)
  console.info("[settings.repo] saveProfile (dummy):", params)
}

/**
 * Change the authenticated user's password via Supabase Auth.
 * Validates client-side length/match before calling; throws on Supabase error.
 */
export async function changePassword(params: ChangePasswordParams): Promise<void> {
  const { newPassword } = params

  if (!newPassword || newPassword.length < 8) {
    throw new Error("Password must be at least 8 characters.")
  }

  const { error } = await supabase.auth.updateUser({ password: newPassword })
  if (error) throw error
}

/**
 * Load notification/behavior preferences for a user.
 * Dummy values (later: swap to Supabase query from user_preferences table).
 */
export async function getUserPreferences(
  _userId: string
): Promise<UserPreferences> {
  await fakeDelay(100)
  // Dummy values (later: swap to Supabase query results)
  return { ...DEFAULT_PREFERENCES }
}

/**
 * Persist updated preferences for a user.
 * Dummy values (later: upsert into user_preferences table).
 */
export async function saveUserPreferences(
  userId: string,
  prefs: UserPreferences
): Promise<void> {
  await fakeDelay(200)
  // Dummy values (later: swap to Supabase upsert)
  console.info("[settings.repo] saveUserPreferences (dummy):", userId, prefs)
}

/**
 * Sign the current user out and return the redirect path.
 */
export async function logout(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

/**
 * Check whether the current session was authenticated via Google OAuth.
 * Used by the settings page to conditionally hide the change-password section.
 */
export async function isGoogleUser(): Promise<boolean> {
  const { data } = await supabase.auth.getSession()
  const session = data.session
  if (!session) return false

  const providers = (session.user.app_metadata as any)?.providers as string[] | undefined
  const provider  = (session.user.app_metadata as any)?.provider  as string | undefined

  return (providers?.includes("google") ?? false) || provider === "google"
}
