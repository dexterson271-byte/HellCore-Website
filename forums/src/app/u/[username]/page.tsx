import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { ThreadCard } from "@/components/ThreadCard";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ username: string }>; searchParams: Promise<{ tab?: string }> };

export async function generateMetadata({ params }: Props) {
  const { username } = await params;
  return { title: `${username} · Profile` };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const { username } = await params;
  const { tab = "overview" } = await searchParams;
  const user = await prisma.forumUser.findUnique({
    where: { username },
    include: {
      badges: { include: { badge: true } },
      achievements: { include: { achievement: true } },
    },
  });
  if (!user) notFound();

  const [threads, posts] = await Promise.all([
    prisma.thread.findMany({
      where: { authorId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { author: true, category: true },
    }),
    prisma.post.findMany({
      where: { authorId: user.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: { thread: true },
    }),
  ]);

  const tabs = ["overview", "threads", "posts", "activity", "achievements"] as const;

  return (
    <div className="container" style={{ display: "grid", gap: 16 }}>
      <section className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ height: 120, background: `linear-gradient(135deg, ${user.bannerUrl ? "transparent" : "rgba(255,107,44,0.35)"}, rgba(0,0,0,0.6))`, backgroundImage: user.bannerUrl ? `url(${user.bannerUrl})` : undefined, backgroundSize: "cover" }} />
        <div style={{ padding: "1.1rem 1.2rem" }}>
          <h1 style={{ margin: "0 0 6px" }}>{user.displayName || user.username}</h1>
          <div className="muted">@{user.username} · {user.role} · Level {user.level}</div>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 12, fontSize: "0.9rem" }}>
            <span>{user.reputation} reputation</span>
            <span>{user.xp} XP</span>
            <span>{user.threadCount} threads</span>
            <span>{user.postCount} posts</span>
            {user.mcUsername && <span>MC: {user.mcUsername}</span>}
          </div>
          {user.bio && <p style={{ marginTop: 12 }}>{user.bio}</p>}
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
            {user.badges.map((b) => (
              <span key={b.id} className="tag">{b.badge.icon} {b.badge.name}</span>
            ))}
          </div>
        </div>
      </section>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <Link key={t} href={`/u/${username}?tab=${t}`} className={tab === t ? "btn" : "btn-ghost"} style={{ textTransform: "capitalize" }}>
            {t}
          </Link>
        ))}
      </div>

      {tab === "overview" && (
        <div className="card" style={{ padding: "1rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            Joined {user.createdAt.toLocaleDateString()} · Last active {user.lastActiveAt ? user.lastActiveAt.toLocaleString() : "—"}
          </p>
        </div>
      )}
      {tab === "threads" && (
        <div style={{ display: "grid", gap: 10 }}>
          {threads.map((t) => (
            <ThreadCard key={t.id} {...t} lastActivityAt={t.lastActivityAt} />
          ))}
        </div>
      )}
      {tab === "posts" && (
        <div style={{ display: "grid", gap: 10 }}>
          {posts.map((p) => (
            <Link key={p.id} href={`/t/${p.threadId}/${p.thread.slug}`} className="card" style={{ padding: "0.9rem" }}>
              <div style={{ fontWeight: 700 }}>{p.thread.title}</div>
              <div className="muted" style={{ marginTop: 6 }}>{p.body.slice(0, 180)}</div>
            </Link>
          ))}
        </div>
      )}
      {tab === "activity" && (
        <div className="card" style={{ padding: "1rem" }}>
          <div className="muted">Recent posts and threads are listed in the Threads / Posts tabs.</div>
        </div>
      )}
      {tab === "achievements" && (
        <div className="card" style={{ padding: "1rem", display: "grid", gap: 8 }}>
          {user.achievements.map((a) => (
            <div key={a.id}>
              <strong>{a.achievement.name}</strong>
              <div className="muted">{a.achievement.description}</div>
            </div>
          ))}
          {!user.achievements.length && <div className="muted">No achievements yet.</div>}
        </div>
      )}
    </div>
  );
}
