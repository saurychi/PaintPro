export const USE_DUMMY_DATA = true

export async function fakeDelay(ms = 250) {
  if (!USE_DUMMY_DATA) return
  await new Promise((r) => setTimeout(r, 1500))
}

export function toMs(iso: string) {
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? 0 : ms
}

export function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n))
}