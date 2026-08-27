import Link from "next/link";
import { prisma } from "@/lib/db";
import { ThreadCard } from "@/components/ThreadCard";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getSession();
  const onlineCutoff = new Date(Date.now() - 5 * 60_000);
  const [members, online, threads, posts, trending, latest, announcements, leaders, onlineUsers, popularWeek] =
    await Promise.all([
      prisma.forumUser.count(),
      prisma.forumUser.count({ where: { lastActiveAt: { gte: onlineCutoff } } }),
      prisma.thread.count({ where: { deletedAt: null } }),
      prisma.post.count({ where: { deletedAt: null } }),
      prisma.thread.findMany({
        where: { deletedAt: null },
        orderBy: [{ replyCount: "desc" }, { views: "desc" }],
        take: 6,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 8,
        include: { author: true, category: true },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null, isAnnouncement: true },
        orderBy: { createdAt: "desc" },
        take: 5,
        include: { author: true, category: true },
      }),
      prisma.forumUser.findMany({
        orderBy: { reputation: "desc" },
        take: 8,
      }),
      prisma.forumUser.findMany({
        where: { lastActiveAt: { gte: onlineCutoff } },
        take: 16,
        orderBy: { lastActiveAt: "desc" },
      }),
      prisma.thread.findMany({
        where: { deletedAt: null, createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
        orderBy: { views: "desc" },
        take: 6,
        include: { author: true, category: true },
      }),
    ]);

  return (
    <div className="container" style={{ display: "grid", gap: 22 }}>
      <section className="card" style={{ padding: "1.6rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "end" }}>
          <div>
            <div className="tag" style={{ marginBottom: 10 }}>Community</div>
            <h1 style={{ margin: "0 0 8px", fontSize: "clamp(1.8rem, 4vw, 2.6rem)", letterSpacing: "-0.04em" }}>
              Hellcore Forums
            </h1>
            <p className="muted" style={{ margin: 0, maxWidth: 560, lineHeight: 1.6 }}>
              Competitive Bedwars discussion, support, announcements, and community — built for Hellcore players.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Link href="/new" className="btn">Create Discussion</Link>
            <Link href="/forums" className="btn-ghost">Explore Forums</Link>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(120px,1fr))", gap: 12, marginTop: 22 }}>
          {[
            ["Members", members],
            ["Online", online],
            ["Discussions", threads],
            ["Posts", posts],
          ].map(([label, value]) => (
            <div key={String(label)} style={{ background: "rgba(0,0,0,0.28)", borderRadius: 12, padding: "0.9rem 1rem", border: "1px solid var(--bd)" }}>
              <div className="muted" style={{ fontSize: "0.72rem", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</div>
              <div style={{ fontSize: "1.4rem", fontWeight: 800, marginTop: 4 }}>{value as number}</div>
            </div>
          ))}
        </div>
        {!session && (
          <p className="muted" style={{ marginTop: 16, fontSize: "0.9rem" }}>
            Login with your Hellcore account to post, react, and message — same login as the main site and store.
          </p>
        )}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "minmax(0,1.6fr) minmax(280px,0.9fr)", gap: 18 }}>
        <div style={{ display: "grid", gap: 18 }}>
          <Block title="Trending Discussions" href="/discover?tab=trending">
            {trending.map((t) => (
              <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
            ))}
          </Block>
          <Block title="Latest Discussions" href="/discover?tab=new">
            {latest.map((t) => (
              <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
            ))}
          </Block>
          <Block title="Popular This Week" href="/discover?tab=popular">
            {popularWeek.map((t) => (
              <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
            ))}
          </Block>
        </div>
        <aside style={{ display: "grid", gap: 18, alignContent: "start" }}>
          <div className="card" style={{ padding: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Staff Announcements</h3>
            <div style={{ display: "grid", gap: 10 }}>
              {announcements.length ? announcements.map((a) => (
                <Link key={a.id} href={`/t/${a.id}/${a.slug}`} style={{ display: "block" }}>
                  <div style={{ fontWeight: 700 }}>{a.title}</div>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>{a.author.username}</div>
                </Link>
              )) : <div className="muted">No announcements yet.</div>}
            </div>
          </div>
          <div className="card" style={{ padding: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Online Now</h3>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {onlineUsers.length ? onlineUsers.map((u) => (
                <Link key={u.id} href={`/u/${u.username}`} className="tag">{u.username}</Link>
              )) : <div className="muted">Quiet right now.</div>}
            </div>
          </div>
          <div className="card" style={{ padding: "1rem" }}>
            <h3 style={{ marginTop: 0 }}>Community Leaderboard</h3>
            <div style={{ display: "grid", gap: 8 }}>
              {leaders.map((u, i) => (
                <Link key={u.id} href={`/u/${u.username}`} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                  <span>#{i + 1} {u.username} <span className="muted">L{u.level}</span></span>
                  <span className="muted">{u.reputation} rep</span>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}

function Block({ title, href, children }: { title: string; href: string; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <h2 style={{ margin: 0, fontSize: "1.15rem" }}>{title}</h2>
        <Link href={href} className="muted" style={{ fontSize: "0.85rem" }}>View all</Link>
      </div>
      <div style={{ display: "grid", gap: 10 }}>{children}</div>
    </section>
  );
}
