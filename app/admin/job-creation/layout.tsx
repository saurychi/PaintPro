import { Suspense } from "react";
import JobCreationStatusGuard from "@/components/project-creation/JobCreationStatusGuard";
import WizardExitGuard from "@/components/project-creation/WizardExitGuard";

export default function JobCreationLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<>{children}</>}>
      <JobCreationStatusGuard>
        <WizardExitGuard />
        {children}
      </JobCreationStatusGuard>
    </Suspense>
  );
}
