import { Suspense } from "react";
import CoachApp from "@/components/CoachApp";

function LoadingShell() {
  return (
    <div className="flex h-dvh items-center justify-center bg-canvas text-sm text-muted">
      <p role="status">Loading Parent Coach…</p>
    </div>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingShell />}>
      <CoachApp />
    </Suspense>
  );
}
