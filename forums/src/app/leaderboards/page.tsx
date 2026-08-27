import Link from "next/link";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function LeaderboardsPage() {
  const [byReputation, byPosts, byXp] = await Promise.all([
    prisma.forumUser.findMany({ orderBy: { reputation: "desc" }, take: 20 }),
    prisma.forumUser.findMany({ orderBy: { postCount: "desc" }, take: 20 }),
    prisma.forumUser.findMany({ orderBy: { xp: "desc" }, take: 20 }),
  ]);

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <h1 style={{ margin: 0 }}>Leaderboards</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))", gap: 14 }}>
        <Board title="Reputation" rows={byReputation.map((u) => ({ username: u.username, value: u.reputation }))} />
        <Board title="Posts" rows={byPosts.map((u) => ({ username: u.username, value: u.postCount }))} />
        <Board title="XP" rows={byXp.map((u) => ({ username: u.username, value: u.xp }))} />
      </div>
    </div>
  );
}

function Board({ title, rows }: { title: string; rows: { username: string; value: number }[] }) {
  return (
    <section className="card" style={{ padding: "1rem" }}>
      <h2 style={{ marginTop: 0, fontSize: "1rem" }}>{title}</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {rows.map((r, i) => (
          <Link key={r.username} href={`/u/${r.username}`} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>#{i + 1} {r.username}</span>
            <span className="muted">{r.value}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
