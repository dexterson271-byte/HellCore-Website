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
      include: { author: { select: { username: true, mcUsername: true, level: true, role: true, avatarUrl: true } } },
    }),
    getForumSidebarData(),
  ]);

  return (
    <main className="page">
      <div className="content">
        <section className="main-column">
          <div className="breadcrumb">
            <Link href="/">Forums</Link> › <strong>{category.name}</strong>
          </div>

          <div className="forum-header">
            <Link href={`/new?category=${category.id}`} className="btn primary">POST THREAD...</Link>
          </div>

          <section className="forum-section">
            <h2 className="forum-section-title">{category.name}</h2>
            {category.description && (
              <div style={{ padding: "12px 15px", borderBottom: "1px solid #281313", color: "#888", fontSize: 13 }}>
                {category.description}
              </div>
            )}
            {threads.map((t) => (
              <ThreadRow key={t.id} {...t} />
            ))}
            {!threads.length && (
              <div style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
                No threads yet.{" "}
                <Link href={`/new?category=${category.id}`} style={{ color: "#e64638" }}>
                  Start the first discussion
                </Link>
              </div>
            )}
          </section>
        </section>

        <ForumSidebar
          user={sidebar.session}
          userProfile={sidebar.userProfile}
          onlineUsers={sidebar.onlineUsers}
          latestPosts={sidebar.latestPosts}
          stats={sidebar.stats}
        />
      </div>
    </main>
  );
}
