import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/db";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import { randomBytes } from "crypto";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const rl = await rateLimit(`upload:${session.forumUserId}`, 10, 60_000);
    if (!rl.ok) return json({ error: "Upload rate limit" }, 429);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return json({ error: "file required" }, 400);
    const max = Number(process.env.MAX_UPLOAD_BYTES || 5_242_880);
    if (file.size > max) return json({ error: "File too large" }, 400);
    if (!ALLOWED.has(file.type)) return json({ error: "MIME not allowed" }, 400);

    const dir = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
    await mkdir(dir, { recursive: true });
    const ext = file.type.split("/")[1] || "bin";
    const name = `${Date.now()}-${randomBytes(6).toString("hex")}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(dir, name), buf);
    const url = `/uploads/${name}`;

    const attachment = await prisma.attachment.create({
      data: {
        userId: session.forumUserId,
        url,
        filename: file.name,
        mime: file.type,
        size: file.size,
        postId: form.get("postId") ? Number(form.get("postId")) : null,
      },
    });
    return json({ attachment }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
