import { prisma } from "./db";
import { getSession } from "./auth";

export async function getForumSidebarData() {
  const onlineCutoff = new Date(Date.now() - 5 * 60_000);
  const session = await getSession();

  const [onlineUsers, members, online, threadCount, postCount, userProfile] = await Promise.all([
    prisma.forumUser.findMany({
      where: { lastActiveAt: { gte: onlineCutoff } },
      take: 40,
      orderBy: { lastActiveAt: "desc" },
      select: { id: true, username: true, mcUsername: true, role: true },
    }),
    prisma.forumUser.count(),
    prisma.forumUser.count({ where: { lastActiveAt: { gte: onlineCutoff } } }),
    prisma.thread.count({ where: { deletedAt: null } }),
    prisma.post.count({ where: { deletedAt: null } }),
    session
      ? prisma.forumUser.findUnique({
          where: { id: session.forumUserId },
          select: {
            username: true,
            mcUsername: true,
            role: true,
            reputation: true,
            postCount: true,
            threadCount: true,
            level: true,
            avatarUrl: true,
          },
        })
      : null,
  ]);

  return {
    session,
    userProfile,
    onlineUsers,
    stats: { members, online, threads: threadCount, posts: postCount },
  };
}

export async function getForumIndexData() {
  const sidebar = await getForumSidebarData();

  const groups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });

  const categoryIds = groups.flatMap((g) => g.categories.map((c) => c.id));
  const latestThreads = categoryIds.length
    ? await prisma.thread.findMany({
        where: { deletedAt: null, categoryId: { in: categoryIds } },
        orderBy: { lastActivityAt: "desc" },
        distinct: ["categoryId"],
        include: { author: { select: { username: true, mcUsername: true } } },
      })
    : [];

  const latestByCategory = new Map(latestThreads.map((t) => [t.categoryId, t]));

  return { ...sidebar, groups, latestByCategory };
}

export function categoryIcon(icon?: string | null, name?: string) {
  if (icon) return icon;
  const n = (name || "").toLowerCase();
  if (n.includes("announce")) return "📢";
  if (n.includes("news")) return "📰";
  if (n.includes("bed")) return "🛏️";
  if (n.includes("sky")) return "☁️";
  if (n.includes("help") || n.includes("support")) return "❓";
  if (n.includes("bug")) return "🐛";
  if (n.includes("suggest")) return "💡";
  if (n.includes("media")) return "🎬";
  if (n.includes("clan")) return "⚔️";
  if (n.includes("dev")) return "💻";
  if (n.includes("event")) return "🎉";
  if (n.includes("appeal")) return "📋";
  if (n.includes("general") || n.includes("intro")) return "💬";
  return "📁";
}

export function roleLabel(role: string) {
  const r = role.toLowerCase();
  if (r === "owner" || r === "founder") return "Owner";
  if (r === "admin") return "Administrator";
  if (r === "dev") return "Developer";
  if (r === "mod") return "Moderator";
  if (r === "helper") return "Helper";
  if (r === "vip") return "VIP";
  return "Member";
}
