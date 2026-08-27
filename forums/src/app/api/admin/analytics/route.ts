import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

export async function GET() {
  try {
    await requireStaff();
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [
      users,
      threads,
      posts,
      reportsOpen,
      eventsToday,
      topCategories,
      recentMod,
    ] = await Promise.all([
      prisma.forumUser.count(),
      prisma.thread.count({ where: { deletedAt: null } }),
      prisma.post.count({ where: { deletedAt: null } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.analyticsEvent.groupBy({
        by: ["type"],
        where: { createdAt: { gte: dayAgo } },
        _count: { type: true },
      }),
      prisma.category.findMany({ orderBy: { threadCount: "desc" }, take: 8 }),
      prisma.moderationAction.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: { select: { username: true } } },
      }),
    ]);
    return json({
      overview: { users, threads, posts, reportsOpen },
      eventsToday,
      topCategories,
      recentMod,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
