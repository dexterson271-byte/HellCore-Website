"use client";

import { useSearchParams } from "next/navigation";
import NewThreadForm from "./NewThreadForm";
import PostThreadPicker from "./PostThreadPicker";

export default function NewThreadPageClient() {
  const params = useSearchParams();
  const category = params.get("category");

  if (!category) return <PostThreadPicker />;
  return <NewThreadForm />;
}
