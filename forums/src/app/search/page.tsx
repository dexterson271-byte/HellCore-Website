import { prisma } from "@/lib/db";
import { ThreadCard } from "@/components/ThreadCard";

export const dynamic = "force-dynamic";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q = "" } = await searchParams;
  const query = q.trim();
  const threads = query
    ? await prisma.thread.findMany({
        where: {
          deletedAt: null,
          OR: [
            { title: { contains: query, mode: "insensitive" } },
            { searchText: { contains: query, mode: "insensitive" } },
          ],
        },
        orderBy: { lastActivityAt: "desc" },
        take: 40,
        include: { author: true, category: true },
      })
    : [];

  return (
    <div className="container" style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Search</h1>
      <form>
        <input className="input" name="q" defaultValue={query} placeholder="Search discussions…" />
      </form>
      <div style={{ display: "grid", gap: 10 }}>
        {threads.map((t) => (
          <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
        ))}
        {query && !threads.length && <div className="muted">No results for “{query}”.</div>}
      </div>
    </div>
  );
}
