import { prisma } from "./db";
import { getSession } from "./auth";

export async function getForumSidebarData() {
  const onlineCutoff = new Date(Date.now() - 5 * 60_000);
  const session = await getSession();

  const [onlineUsers, members, online, threadCount, postCount, userProfile, latestPosts] = await Promise.all([
    prisma.forumUser.findMany({
      where: { lastActiveAt: { gte: onlineCutoff } },
      take: 40,
      orderBy: { lastActiveAt: "desc" },
      select: { id: true, username: true, mcUsername: true, role: true, avatarUrl: true },
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
    prisma.thread.findMany({
      where: { deletedAt: null },
      orderBy: { lastActivityAt: "desc" },
      take: 8,
      include: {
        author: { select: { username: true, mcUsername: true, role: true, avatarUrl: true } },
        category: { select: { name: true, slug: true, color: true } },
      },
    }),
  ]);

  return {
    session,
    userProfile,
    onlineUsers,
    latestPosts,
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
        include: {
          author: { select: { username: true, mcUsername: true, role: true, avatarUrl: true } },
        },
      })
    : [];

  const latestByCategory = new Map(latestThreads.map((t) => [t.categoryId, t]));

  return { ...sidebar, groups, latestByCategory };
}

export function categoryIconClass(slug: string, name?: string) {
  const s = slug.toLowerCase();
  const n = (name || "").toLowerCase();
  if (s.includes("announce") || n.includes("announce")) return "cat-icon-announce";
  if (s.includes("server-discussion") || n.includes("server discussion")) return "cat-icon-discuss";
  if (s.includes("suggest") || n.includes("suggest")) return "cat-icon-suggest";
  if (s.includes("bed")) return "cat-icon-bed";
  if (s.includes("sky")) return "cat-icon-sky";
  if (s.includes("help") || s.includes("support")) return "cat-icon-help";
  if (s.includes("bug")) return "cat-icon-bug";
  if (s.includes("media")) return "cat-icon-media";
  if (s.includes("clan")) return "cat-icon-clan";
  if (s.includes("dev")) return "cat-icon-dev";
  if (s.includes("event")) return "cat-icon-event";
  if (s.includes("general") || s.includes("intro")) return "cat-icon-chat";
  return "cat-icon-default";
}

/** @deprecated use categoryIconClass */
export function categoryIcon(icon?: string | null, name?: string) {
  return categoryIconClass(name || "default", name);
}

export { roleLabel, roleColor } from "./roles";
