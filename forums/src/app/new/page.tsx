import { Suspense } from "react";
import NewThreadPageClient from "./NewThreadPageClient";

export default function NewThreadPage() {
  return (
    <Suspense fallback={<div className="muted" style={{ padding: "2rem" }}>Loading…</div>}>
      <NewThreadPageClient />
    </Suspense>
  );
}
