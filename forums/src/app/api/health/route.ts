import { json } from "@/lib/api";

export async function GET() {
  return json({ ok: true, service: "hellcore-forums", ts: new Date().toISOString() });
}
