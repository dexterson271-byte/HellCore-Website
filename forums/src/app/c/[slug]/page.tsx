import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ThreadRow } from "@/components/ThreadCard";
import { ForumSidebar } from "@/components/ForumSidebar";
import { getForumSidebarData } from "@/lib/forum-data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const cat = await prisma.category.findUnique({ where: { slug } });
  if (!cat) return {};
  return { title: cat.name, description: cat.description || `${cat.name} on Hellcore Forums` };
}

export default async function CategoryPage({ params }: Props) {
  const { slug } = await params;
  const category = await prisma.category.findUnique({ where: { slug } });
  if (!category) notFound();

  const [threads, sidebar] = await Promise.all([
    prisma.thread.findMany({
      where: { categoryId: category.id, deletedAt: null },
      orderBy: [{ isPinned: "desc" }, { lastActivityAt: "desc" }],
      take: 40,
      include: { author: { select: { username: true, mcUsername: true, level: true } } },
    }),
    getForumSidebarData(),
  ]);

  return (
    <div className="container forum-layout">
      <div>
        <div className="forum-frame">
          <div className="forum-toolbar">
            <div className="breadcrumb">
              <Link href="/">Home</Link> <span className="muted">›</span>{" "}
              <Link href="/forums">Forums</Link> <span className="muted">›</span>{" "}
              <strong style={{ color: category.color }}>{category.name}</strong>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href={`/new?category=${category.id}`} className="btn btn-sm">Post thread…</Link>
            </div>
          </div>

          {category.description && (
            <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--frame-border)", fontSize: "0.85rem" }} className="muted">
              {category.description}
            </div>
          )}

          <div className="forum-col-headers" style={{ gridTemplateColumns: "1fr auto auto" }}>
            <span>Thread</span>
            <span className="col-stat">Replies</span>
            <span className="col-stat">Views</span>
          </div>

          {threads.map((t) => (
            <ThreadRow key={t.id} {...t} />
          ))}

          {!threads.length && (
            <div style={{ padding: "2rem", textAlign: "center" }} className="muted">
              No threads yet.{" "}
              <Link href={`/new?category=${category.id}`} style={{ color: "var(--gold-light)" }}>
                Start the first discussion
              </Link>
            </div>
          )}
        </div>
      </div>

      <ForumSidebar
        user={sidebar.session}
        userProfile={sidebar.userProfile}
        onlineUsers={sidebar.onlineUsers}
        stats={sidebar.stats}
      />
    </div>
  );
}
