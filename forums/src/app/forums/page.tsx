import Link from "next/link";
import { prisma } from "@/lib/db";
import { ThreadCard } from "@/components/ThreadCard";

export const dynamic = "force-dynamic";

export default async function ForumsPage() {
  const groups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });
  const recent = await prisma.thread.findMany({
    where: { deletedAt: null },
    orderBy: { lastActivityAt: "desc" },
    take: 10,
    include: { author: true, category: true },
  });

  return (
    <div className="container" style={{ display: "grid", gap: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div>
          <h1 style={{ margin: 0 }}>Forums</h1>
          <p className="muted" style={{ margin: "6px 0 0" }}>Browse every Hellcore category</p>
        </div>
        <Link href="/new" className="btn">Create Thread</Link>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        {groups.map((g) => (
          <section key={g.id} className="card" style={{ padding: "1rem" }}>
            <h2 style={{ margin: "0 0 12px", fontSize: "0.95rem", letterSpacing: "0.08em", color: "var(--tx2)" }}>{g.name}</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {g.categories.map((c) => (
                <Link key={c.id} href={`/c/${c.slug}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "0.75rem 0.5rem", borderTop: "1px solid var(--bd)" }}>
                  <div>
                    <div style={{ fontWeight: 800, color: c.color }}>{c.name}</div>
                    <div className="muted" style={{ fontSize: "0.85rem" }}>{c.description}</div>
                  </div>
                  <div className="muted" style={{ textAlign: "right", fontSize: "0.8rem" }}>
                    <div>{c.threadCount} threads</div>
                    <div>{c.postCount} posts</div>
                  </div>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>

      <section>
        <h2 style={{ fontSize: "1.1rem" }}>Active right now</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {recent.map((t) => (
            <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
          ))}
        </div>
      </section>
    </div>
  );
}
