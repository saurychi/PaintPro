import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Storage buckets used by the app are private by default — admin-side
// signatures, signed quotation/invoice PDFs, and project document attachments.
// Auto-creating them on first use means a fresh Supabase project just works
// without a separate dashboard setup step.
const ensuredBuckets = new Set<string>();

export async function ensureBucket(name: string, options: { public?: boolean } = {}) {
  if (ensuredBuckets.has(name)) return;

  const { data, error: getError } = await supabaseAdmin.storage.getBucket(name);
  if (data) {
    ensuredBuckets.add(name);
    return;
  }

  // getBucket failure with "not found" → create it. Any other error (auth,
  // network) we surface so the caller can include it in the response.
  const message = getError?.message?.toLowerCase() ?? "";
  if (getError && !message.includes("not found") && !message.includes("not_found")) {
    throw new Error(
      `Failed to inspect storage bucket "${name}": ${getError.message}`,
    );
  }

  const { error: createError } = await supabaseAdmin.storage.createBucket(name, {
    public: Boolean(options.public),
  });

  if (createError) {
    const createMsg = createError.message?.toLowerCase() ?? "";
    // Treat a concurrent-create race as success.
    if (!createMsg.includes("already exists") && !createMsg.includes("duplicate")) {
      throw new Error(
        `Failed to create storage bucket "${name}": ${createError.message}`,
      );
    }
  }

  ensuredBuckets.add(name);
}
