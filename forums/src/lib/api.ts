import { NextResponse } from "next/server";
import { AuthError } from "./auth";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export function handleApiError(err: unknown) {
  if (err instanceof AuthError) {
    return json({ error: err.message }, err.status);
  }
  console.error(err);
  return json({ error: err instanceof Error ? err.message : "Server error" }, 500);
}
