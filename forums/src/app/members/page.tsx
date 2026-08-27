import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string }>;
}) {
  const { q, sort = "reputation" } = await searchParams;
  const where = q
    ? { OR: [{ username: { contains: q, mode: "insensitive" as const } }, { mcUsername: { contains: q, mode: "insensitive" as const } }] }
    : {};
  const orderBy =
    sort === "posts" ? { postCount: "desc" as const } : sort === "xp" ? { xp: "desc" as const } : { reputation: "desc" as const };
  const members = await prisma.forumUser.findMany({ where, orderBy, take: 48 });

  return (
    <div className="container" style={{ display: "grid", gap: 16 }}>
      <h1 style={{ margin: 0 }}>Members</h1>
      <form style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <input className="input" name="q" defaultValue={q || ""} placeholder="Search members" style={{ maxWidth: 320 }} />
        <select className="input" name="sort" defaultValue={sort} style={{ maxWidth: 180 }}>
          <option value="reputation">Reputation</option>
          <option value="posts">Posts</option>
          <option value="xp">XP</option>
        </select>
        <button className="btn" type="submit">Search</button>
      </form>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))", gap: 12 }}>
        {members.map((m) => (
          <Link key={m.id} href={`/u/${m.username}`} className="card" style={{ padding: "0.9rem" }}>
            <div style={{ fontWeight: 800 }}>{m.username}</div>
            <div className="muted" style={{ fontSize: "0.82rem" }}>L{m.level} · {m.role}</div>
            <div className="muted" style={{ fontSize: "0.82rem", marginTop: 6 }}>{m.reputation} rep · {m.postCount} posts</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
