import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";

export async function GET() {
  try {
    const onlineCutoff = new Date(Date.now() - 5 * 60_000);
    const [members, online, threads, posts, trending, latest, announcements, leaders] =
      await Promise.all([
        prisma.forumUser.count(),
        prisma.forumUser.count({ where: { lastActiveAt: { gte: onlineCutoff } } }),
        prisma.thread.count({ where: { deletedAt: null } }),
        prisma.post.count({ where: { deletedAt: null } }),
        prisma.thread.findMany({
          where: { deletedAt: null },
          orderBy: [{ replyCount: "desc" }, { views: "desc" }],
          take: 6,
          include: { author: true, category: true },
        }),
        prisma.thread.findMany({
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 8,
          include: { author: true, category: true },
        }),
        prisma.thread.findMany({
          where: { deletedAt: null, isAnnouncement: true },
          orderBy: { createdAt: "desc" },
          take: 5,
          include: { author: true, category: true },
        }),
        prisma.forumUser.findMany({
          orderBy: { reputation: "desc" },
          take: 8,
          select: {
            id: true,
            username: true,
            avatarUrl: true,
            level: true,
            reputation: true,
            postCount: true,
            role: true,
          },
        }),
      ]);

    const onlineUsers = await prisma.forumUser.findMany({
      where: { lastActiveAt: { gte: onlineCutoff } },
      take: 24,
      select: { id: true, username: true, avatarUrl: true, role: true, level: true },
      orderBy: { lastActiveAt: "desc" },
    });

    return json({
      stats: { members, online, threads, posts },
      trending,
      latest,
      announcements,
      leaders,
      onlineUsers,
    });
  } catch (e) {
    return handleApiError(e);
  }
}
