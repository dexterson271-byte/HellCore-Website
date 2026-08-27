import { Suspense } from "react";
import NewThreadForm from "./NewThreadForm";

export default function NewThreadPage() {
  return (
    <div className="container">
      <Suspense fallback={<div className="muted">Loading…</div>}>
        <NewThreadForm />
      </Suspense>
    </div>
  );
}
