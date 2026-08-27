import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { isStaff } from "@/lib/types";
import { prisma } from "@/lib/db";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getSession();
  if (!session || !isStaff(session.role)) redirect("/");

  const dayAgo = new Date(Date.now() - 86400_000);
  const [users, threads, posts, reports, eventsToday, categories, reportsList, recentMod, flags] =
    await Promise.all([
      prisma.forumUser.count(),
      prisma.thread.count({ where: { deletedAt: null } }),
      prisma.post.count({ where: { deletedAt: null } }),
      prisma.report.count({ where: { status: "OPEN" } }),
      prisma.analyticsEvent.groupBy({ by: ["type"], where: { createdAt: { gte: dayAgo } }, _count: { type: true } }),
      prisma.category.findMany({ orderBy: { sortOrder: "asc" }, include: { group: true } }),
      prisma.report.findMany({
        where: { status: { in: ["OPEN", "REVIEWING"] } },
        orderBy: { createdAt: "desc" },
        take: 30,
        include: { reporter: true, thread: true },
      }),
      prisma.moderationAction.findMany({
        orderBy: { createdAt: "desc" },
        take: 20,
        include: { actor: true },
      }),
      prisma.featureFlag.findMany(),
    ]);

  return (
    <div className="container" style={{ display: "grid", gap: 18 }}>
      <h1 style={{ margin: 0 }}>Admin Dashboard</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(140px,1fr))", gap: 12 }}>
        {[
          ["Users", users],
          ["Threads", threads],
          ["Posts", posts],
          ["Open reports", reports],
        ].map(([k, v]) => (
          <div key={String(k)} className="card" style={{ padding: "0.9rem" }}>
            <div className="muted" style={{ fontSize: "0.75rem" }}>{k}</div>
            <div style={{ fontSize: "1.4rem", fontWeight: 800 }}>{v as number}</div>
          </div>
        ))}
      </div>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Analytics (24h)</h2>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {eventsToday.map((e) => (
            <span key={e.type} className="tag">{e.type}: {e._count.type}</span>
          ))}
          {!eventsToday.length && <span className="muted">No events yet</span>}
        </div>
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Categories</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {categories.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <span>
                <strong style={{ color: c.color }}>{c.name}</strong>{" "}
                <span className="muted">{c.group?.name} · /c/{c.slug}</span>
              </span>
              <span className="muted">{c.threadCount} threads</span>
            </div>
          ))}
        </div>
        <p className="muted" style={{ marginBottom: 0, marginTop: 12, fontSize: "0.85rem" }}>
          Create/edit categories via <code>POST/PATCH /api/categories</code> (staff). Seed defaults with <code>npm run db:seed</code>.
        </p>
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Report queue</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {reportsList.map((r) => (
            <div key={r.id} style={{ borderTop: "1px solid var(--bd)", paddingTop: 10 }}>
              <div style={{ fontWeight: 700 }}>{r.reason}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>
                by {r.reporter.username}
                {r.thread ? (
                  <>
                    {" "}
                    · <Link href={`/t/${r.thread.id}/${r.thread.slug}`}>{r.thread.title}</Link>
                  </>
                ) : null}
              </div>
              <form
                action={async () => {
                  "use server";
                  await prisma.report.update({
                    where: { id: r.id },
                    data: { status: "RESOLVED", resolvedAt: new Date() },
                  });
                }}
              >
                <button className="btn-ghost" type="submit" style={{ marginTop: 8 }}>Resolve</button>
              </form>
            </div>
          ))}
          {!reportsList.length && <div className="muted">Queue clear.</div>}
        </div>
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Moderation audit</h2>
        <div style={{ display: "grid", gap: 8 }}>
          {recentMod.map((m) => (
            <div key={m.id} className="muted" style={{ fontSize: "0.85rem" }}>
              {m.createdAt.toLocaleString()} · {m.actor.username} · {m.action} · {m.targetType}#{m.targetId}
            </div>
          ))}
        </div>
      </section>

      <section className="card" style={{ padding: "1rem" }}>
        <h2 style={{ marginTop: 0 }}>Feature flags</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {flags.map((f) => (
            <span key={f.id} className="tag">{f.key}: {f.enabled ? "on" : "off"}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
