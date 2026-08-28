import Link from "next/link";
import { categoryIconClass, visibleGroupFilter } from "@/lib/forum-data";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const groups = await prisma.categoryGroup.findMany({
    where: visibleGroupFilter(),
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });

  return (
    <main className="page">
      <div className="breadcrumb" style={{ marginBottom: 16 }}>
        <Link href="/">Home</Link> › <strong>Categories</strong>
      </div>
      {groups.map((g) => (
        <section key={g.id} className="forum-section" style={{ marginBottom: 16 }}>
          <h2 className="forum-section-title">{g.name}</h2>
          {g.categories.map((c) => (
            <Link key={c.id} href={`/c/${c.slug}`} className="forum-row">
              <div className={`forum-icon ${categoryIconClass(c.slug, c.name)}`} />
              <div className="forum-info">
                <h3>{c.name}</h3>
                {c.description && <p>{c.description}</p>}
              </div>
              <div className="forum-stats">
                <div className="stat-col">
                  <small>Threads</small>
                  <strong>{c.threadCount}</strong>
                </div>
                <div className="stat-col">
                  <small>Messages</small>
                  <strong>{c.postCount}</strong>
                </div>
              </div>
              <div />
            </Link>
          ))}
        </section>
      ))}
    </main>
  );
}
