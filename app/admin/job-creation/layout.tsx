import { Suspense } from "react";
import JobCreationStatusGuard from "@/components/project-creation/JobCreationStatusGuard";

export default function JobCreationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<>{children}</>}>
      <JobCreationStatusGuard>{children}</JobCreationStatusGuard>
    </Suspense>
  );
}
