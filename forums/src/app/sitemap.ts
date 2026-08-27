import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function sitemap() {
  const base = process.env.FORUMS_PUBLIC_URL || "https://forums.hellcore.net";
  const [categories, threads, users] = await Promise.all([
    prisma.category.findMany({ select: { slug: true, updatedAt: true } }),
    prisma.thread.findMany({
      where: { deletedAt: null, isStaffOnly: false },
      select: { id: true, slug: true, updatedAt: true },
      take: 5000,
      orderBy: { updatedAt: "desc" },
    }),
    prisma.forumUser.findMany({ select: { username: true, updatedAt: true }, take: 2000 }),
  ]);

  return [
    { url: base, lastModified: new Date() },
    { url: `${base}/forums`, lastModified: new Date() },
    { url: `${base}/discover`, lastModified: new Date() },
    { url: `${base}/members`, lastModified: new Date() },
    { url: `${base}/leaderboards`, lastModified: new Date() },
    ...categories.map((c) => ({ url: `${base}/c/${c.slug}`, lastModified: c.updatedAt })),
    ...threads.map((t) => ({ url: `${base}/t/${t.id}/${t.slug}`, lastModified: t.updatedAt })),
    ...users.map((u) => ({ url: `${base}/u/${u.username}`, lastModified: u.updatedAt })),
  ];
}
