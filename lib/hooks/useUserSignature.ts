"use client";

import * as React from "react";
import { supabase } from "@/lib/supabaseClient";

// Fires from app/admin/settings/page.tsx after a successful save so the
// sidebar badge and dashboard gate both drop their stale "no signature"
// state without waiting for a refetch.
export const SIGNATURE_UPDATED_EVENT = "paintpro:signature-updated";

type UserSignatureState = {
  // null = unknown (still loading, signed out, or not admin/manager)
  hasSignature: boolean | null;
  isLoading: boolean;
  refresh: () => void;
};

// Tracks whether the current admin/manager has a saved signature.
// Returns null for non-admin/manager users so callers can skip gating.
export function useUserSignature(): UserSignatureState {
  const [hasSignature, setHasSignature] = React.useState<boolean | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [tick, setTick] = React.useState(0);

  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      setIsLoading(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (!user) {
        setHasSignature(null);
        setIsLoading(false);
        return;
      }

      const { data } = await supabase
        .from("users")
        .select("signature_url, role")
        .eq("id", user.id)
        .maybeSingle();

      if (cancelled) return;

      if (data?.role !== "admin" && data?.role !== "manager") {
        setHasSignature(null);
      } else {
        setHasSignature(Boolean(data?.signature_url));
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [tick]);

  React.useEffect(() => {
    function onUpdated() {
      setTick((t) => t + 1);
    }
    window.addEventListener(SIGNATURE_UPDATED_EVENT, onUpdated);
    return () =>
      window.removeEventListener(SIGNATURE_UPDATED_EVENT, onUpdated);
  }, []);

  const refresh = React.useCallback(() => setTick((t) => t + 1), []);

  return { hasSignature, isLoading, refresh };
}
