import { Loader2 } from "lucide-react";

// Rendered instantly by Next.js when the user navigates between client
// pages, while the destination page's server work (auth check, data
// fetch) is still running. This is what makes sidebar clicks feel
// immediate instead of frozen.
export default function ClientLoading() {
  return (
    <div className="flex h-full min-h-[60vh] items-center justify-center p-12">
      <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
    </div>
  );
}
