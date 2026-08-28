import Link from "next/link";
import { prisma } from "@/lib/db";
import { categoryIcon } from "@/lib/forum-data";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const groups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });

  return (
    <div className="container">
      <div className="forum-frame">
        <div className="forum-toolbar">
          <div className="breadcrumb">
            <Link href="/">Home</Link> <span className="muted">›</span> <strong>Categories</strong>
          </div>
        </div>
        {groups.map((g) => (
          <section key={g.id} className="forum-group">
            <h2 className="forum-group-title">{g.name}</h2>
            {g.categories.map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className="forum-row" style={{ display: "grid" }}>
                <div className="forum-row-icon" style={{ color: c.color }}>
                  {categoryIcon(c.icon, c.name)}
                </div>
                <div className="forum-row-main">
                  <div className="forum-row-title" style={{ color: c.color }}>{c.name}</div>
                  {c.description && <div className="forum-row-desc">{c.description}</div>}
                </div>
                <div className="forum-row-stats">
                  <div className="num">{c.threadCount}</div>
                  <div className="lbl">Threads</div>
                </div>
                <div className="forum-row-stats">
                  <div className="num">{c.postCount}</div>
                  <div className="lbl">Messages</div>
                </div>
                <div />
              </Link>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}
