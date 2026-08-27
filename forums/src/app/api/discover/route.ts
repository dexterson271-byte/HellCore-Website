import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";

export async function GET() {
  try {
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const [trending, newest, popular, unanswered, staff, featured] = await Promise.all([
      prisma.thread.findMany({
        where: { deletedAt: null, lastActivityAt: { gte: weekAgo } },
        orderBy: [{ replyCount: "desc" }, { views: "desc" }],
        take: 12,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null, createdAt: { gte: weekAgo } },
        orderBy: { views: "desc" },
        take: 12,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null, replyCount: 0 },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null, isAnnouncement: true },
        orderBy: { createdAt: "desc" },
        take: 12,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null, isFeatured: true },
        orderBy: { lastActivityAt: "desc" },
        take: 12,
        include: { author: true, category: true },
      }),
    ]);
    return json({ trending, newest, popular, unanswered, staff, featured });
  } catch (e) {
    return handleApiError(e);
  }
}
