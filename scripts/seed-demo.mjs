// Demo seed: specialties, ratings, reorder points, material locations
import { createClient } from "@supabase/supabase-js"

const supabase = createClient(
  "https://igwdfcbrojphoqmzmysd.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlnd2RmY2Jyb2pwaG9xbXpteXNkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MTY0MjUxNywiZXhwIjoyMDg3MjE4NTE3fQ.Kz6AVupt4_n_wAD2rpaXTHvAmKURyey5jjEyNuMvfvE",
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SPECIALTIES = [
  "Interior Painting",
  "Exterior Painting",
  "Ceiling Painting",
  "Feature Wall Painting",
  "Trim, Doors & Frames Painting",
  "Stain Blocking / Primer Work",
  "Wall Preparation",
  "High-Pressure Cleaning",
  "Decking Staining & Coating",
  "Fence & Gate Painting",
  "Decorative Painting",
  "Industrial Coating",
  "Surface Restoration",
  "Roof Painting",
  "Waterproofing & Sealant Application",
]

const RATINGS = ["great", "good", "good", "bad"]

function pick(arr, seed) {
  return arr[seed % arr.length]
}

function rng(seed) {
  let h = 0
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0
  return h
}

async function run() {
  // ── 1. Fetch all staff & managers ─────────────────────────────────────────
  const { data: staff, error: staffErr } = await supabase
    .from("users")
    .select("id, username, specialty")
    .in("role", ["staff", "manager"])

  if (staffErr) { console.error("fetch staff:", staffErr.message); process.exit(1) }
  console.log(`Found ${staff.length} staff/managers`)

  // ── 2. Set specialties — always overwrite with 2-3 comma-separated values ──
  let specialtyCount = 0
  for (const u of staff) {
    const h = rng(u.id)
    const count = 2 + (h % 2)  // 2 or 3 specialties
    // Pick distinct specialties using different offsets of the same hash
    const picked = []
    for (let i = 0; i < SPECIALTIES.length && picked.length < count; i++) {
      const candidate = SPECIALTIES[(h + i * 7) % SPECIALTIES.length]
      if (!picked.includes(candidate)) picked.push(candidate)
    }
    const specialty = picked.join(", ")
    const { error } = await supabase.from("users").update({ specialty }).eq("id", u.id)
    if (error) console.warn(`  specialty ${u.username}: ${error.message}`)
    else specialtyCount++
  }
  console.log(`Updated specialties for ${specialtyCount} users`)

  // ── 3. Fetch projects ──────────────────────────────────────────────────────
  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("project_id")
    .order("created_at", { ascending: false })

  if (projErr || !projects?.length) {
    console.warn("No projects found — skipping performance ratings:", projErr?.message ?? "empty")
  } else {
    console.log(`Found ${projects.length} projects`)

    // ── 4. Seed employee_performance ─────────────────────────────────────────
    // Check which (project_id, user_id) pairs already exist
    const { data: existing } = await supabase
      .from("employee_performance")
      .select("project_id, user_id")

    const existingPairs = new Set(
      (existing ?? []).map((r) => `${r.project_id}::${r.user_id}`)
    )

    const now = new Date().toISOString()
    const perfRows = []

    // Give each staff member 2-3 performance records across different projects
    for (const u of staff) {
      const h = rng(u.id)
      const numRecords = 2 + (h % 2)  // 2 or 3 records each
      for (let i = 0; i < numRecords; i++) {
        const project = projects[(h + i) % projects.length]
        const key = `${project.project_id}::${u.id}`
        if (existingPairs.has(key)) continue
        existingPairs.add(key)
        perfRows.push({
          project_id: project.project_id,
          user_id: u.id,
          work_quality:    pick(RATINGS, h + i),
          time_efficiency: pick(RATINGS, h + i + 1),
          teamwork:        pick(RATINGS, h + i + 2),
          work_ethic:      pick(RATINGS, h + i + 3),
          total_estimated_hours: 40 + ((h + i * 13) % 200),
          hourly_wage: 15 + ((h + i) % 10),
          salary_amount: (15 + ((h + i) % 10)) * (40 + ((h + i * 13) % 200)),
          reviewed_at: now,
          created_at: now,
          updated_at: now,
        })
      }
    }

    if (perfRows.length > 0) {
      const { error: perfErr } = await supabase
        .from("employee_performance")
        .insert(perfRows)
      if (perfErr) console.warn("insert perf:", perfErr.message)
      else console.log(`Inserted ${perfRows.length} performance records`)
    } else {
      console.log("All staff already have performance records — skipped")
    }
  }

  // ── 5. Fetch locations ────────────────────────────────────────────────────
  const { data: locations, error: locErr } = await supabase
    .from("location")
    .select("location_id, name")
    .order("name")

  if (locErr || !locations?.length) {
    console.warn("Could not fetch locations:", locErr?.message ?? "empty")
  } else {
    console.log(`Locations: ${locations.map((l) => l.name).join(", ")}`)

    // ── 6. Fix materials with null location ──────────────────────────────────
    const { data: noLocMats } = await supabase
      .from("materials")
      .select("material_id, name")
      .is("location_id", null)

    if (noLocMats?.length) {
      for (const mat of noLocMats) {
        const locId = locations[rng(mat.material_id) % locations.length].location_id
        const { error } = await supabase
          .from("materials")
          .update({ location_id: locId })
          .eq("material_id", mat.material_id)
        if (error) console.warn(`  location ${mat.name}: ${error.message}`)
      }
      console.log(`Assigned locations to ${noLocMats.length} materials`)
    } else {
      console.log("No materials with null location — already assigned")
    }
  }

  // ── 7. Fix materials with reorder_point = 0 ───────────────────────────────
  const { data: zeroMats } = await supabase
    .from("materials")
    .select("material_id, name, current_in_stock")
    .eq("reorder_point", 0)

  if (zeroMats?.length) {
    for (const mat of zeroMats) {
      const stock = Number(mat.current_in_stock ?? 20)
      const reorderPoint = Math.max(5, Math.round(stock * (0.25 + (rng(mat.material_id) % 20) / 100)))
      const { error } = await supabase
        .from("materials")
        .update({ reorder_point: reorderPoint })
        .eq("material_id", mat.material_id)
      if (error) console.warn(`  reorder ${mat.name}: ${error.message}`)
    }
    console.log(`Updated reorder points for ${zeroMats.length} materials`)
  } else {
    console.log("No materials with reorder_point = 0 — already set")
  }

  console.log("\nDone.")
}

run().catch((err) => { console.error(err); process.exit(1) })
