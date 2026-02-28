"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { useState } from "react";

export default function Pending() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const signInAnotherUser = async () => {
    try {
      setLoading(true);
      await supabase.auth.signOut(); // logs out current user
      router.replace("/auth/signin");
    } catch (e) {
      console.error(e);
      router.replace("/auth/signin");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-svh w-full bg-white flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-[520px] rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Image
            src="/paint_pro_logo.png"
            alt="PaintPro Logo"
            width={72}
            height={72}
            priority
            className="object-contain"
          />
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">
              Account pending
            </h1>
            <p className="mt-1 text-sm text-gray-600">
              Your account is waiting for approval.
            </p>
          </div>
        </div>

        {/* Body */}
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm text-gray-800">
            Your account is pending approval. Please wait for the manager/admin
            to activate it. Once approved, you can sign in normally.
          </p>
        </div>

        {/* Actions */}
        <div className="mt-6 grid gap-3">
          <button
            type="button"
            onClick={() => router.refresh()}
            className="w-full rounded-lg border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-800 shadow-sm hover:bg-gray-50 transition"
          >
            Refresh status
          </button>

          <button
            type="button"
            onClick={signInAnotherUser}
            disabled={loading}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition disabled:opacity-60 disabled:cursor-not-allowed bg-[#00c065] hover:bg-[#00a054]"
          >
            {loading ? "Signing out..." : "Sign in with another user"}
          </button>

          <p className="text-center text-[12px] text-gray-500">
            Signing in with another user will log out the current session.
          </p>
        </div>
      </div>
    </div>
  );
}
