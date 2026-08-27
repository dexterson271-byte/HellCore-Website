import { prisma } from "./db";

const memory = new Map<string, { count: number; resetAt: number }>();

export async function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const resetAt = new Date(now + windowMs);
  const id = `${key}:${Math.floor(now / windowMs)}`;

  // Prefer DB bucket when available; fall back to memory for local/dev.
  try {
    const existing = await prisma.rateLimitBucket.findUnique({ where: { id } });
    if (!existing || existing.resetAt.getTime() < now) {
      await prisma.rateLimitBucket.upsert({
        where: { id },
        create: { id, count: 1, resetAt },
        update: { count: 1, resetAt },
      });
      return { ok: true, remaining: limit - 1 };
    }
    if (existing.count >= limit) {
      return { ok: false, remaining: 0, retryAfterMs: existing.resetAt.getTime() - now };
    }
    const updated = await prisma.rateLimitBucket.update({
      where: { id },
      data: { count: { increment: 1 } },
    });
    return { ok: true, remaining: Math.max(0, limit - updated.count) };
  } catch {
    const bucket = memory.get(id);
    if (!bucket || bucket.resetAt < now) {
      memory.set(id, { count: 1, resetAt: now + windowMs });
      return { ok: true, remaining: limit - 1 };
    }
    if (bucket.count >= limit) {
      return { ok: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
    }
    bucket.count += 1;
    return { ok: true, remaining: limit - bucket.count };
  }
}
