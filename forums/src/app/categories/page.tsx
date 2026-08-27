import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CategoriesPage() {
  const groups = await prisma.categoryGroup.findMany({
    orderBy: { sortOrder: "asc" },
    include: { categories: { orderBy: { sortOrder: "asc" } } },
  });
  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <h1 style={{ margin: 0 }}>Categories</h1>
      {groups.map((g) => (
        <section key={g.id} className="card" style={{ padding: "1.1rem" }}>
          <h2 style={{ marginTop: 0 }}>{g.name}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
            {g.categories.map((c) => (
              <Link key={c.id} href={`/c/${c.slug}`} className="card" style={{ padding: "0.9rem", background: "rgba(0,0,0,0.25)" }}>
                <div style={{ fontWeight: 800, color: c.color }}>{c.name}</div>
                <div className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>{c.description}</div>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
