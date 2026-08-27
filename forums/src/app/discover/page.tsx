import DiscoverClient from "@/components/DiscoverClient";

export const dynamic = "force-dynamic";

async function loadDiscover() {
  const base = process.env.FORUMS_PUBLIC_URL || "http://localhost:3000";
  try {
    const res = await fetch(`${base}/api/discover`, { cache: "no-store" });
    if (res.ok) return res.json();
  } catch {
    /* fall through */
  }
  const { prisma } = await import("@/lib/db");
  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const include = { author: true, category: true } as const;
  const [trending, newest, popular, unanswered, staff, featured] = await Promise.all([
    prisma.thread.findMany({ where: { deletedAt: null, lastActivityAt: { gte: weekAgo } }, orderBy: [{ replyCount: "desc" }], take: 20, include }),
    prisma.thread.findMany({ where: { deletedAt: null }, orderBy: { createdAt: "desc" }, take: 20, include }),
    prisma.thread.findMany({ where: { deletedAt: null, createdAt: { gte: weekAgo } }, orderBy: { views: "desc" }, take: 20, include }),
    prisma.thread.findMany({ where: { deletedAt: null, replyCount: 0 }, orderBy: { createdAt: "desc" }, take: 20, include }),
    prisma.thread.findMany({ where: { deletedAt: null, isAnnouncement: true }, orderBy: { createdAt: "desc" }, take: 20, include }),
    prisma.thread.findMany({ where: { deletedAt: null, isFeatured: true }, orderBy: { lastActivityAt: "desc" }, take: 20, include }),
  ]);
  return { trending, newest, popular, unanswered, staff, featured };
}

export default async function DiscoverPage() {
  const data = await loadDiscover();
  return <DiscoverClient initial={data} />;
}
