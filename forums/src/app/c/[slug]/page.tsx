import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ThreadCard } from "@/components/ThreadCard";

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
  const threads = await prisma.thread.findMany({
    where: { categoryId: category.id, deletedAt: null },
    orderBy: [{ isPinned: "desc" }, { lastActivityAt: "desc" }],
    take: 40,
    include: { author: true, category: true },
  });

  return (
    <div className="container" style={{ display: "grid", gap: 16 }}>
      <div className="card" style={{ padding: "1.2rem", borderColor: `${category.color}55` }}>
        <div className="muted" style={{ fontSize: "0.8rem" }}>
          <Link href="/forums">Forums</Link> / {category.name}
        </div>
        <h1 style={{ margin: "8px 0", color: category.color }}>{category.name}</h1>
        <p className="muted" style={{ margin: 0 }}>{category.description}</p>
        <div style={{ marginTop: 14 }}>
          <Link href={`/new?category=${category.id}`} className="btn">New thread</Link>
        </div>
      </div>
      <div style={{ display: "grid", gap: 10 }}>
        {threads.map((t) => (
          <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
        ))}
        {!threads.length && <div className="muted">No threads yet. Start the first discussion.</div>}
      </div>
    </div>
  );
}
