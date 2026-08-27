import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getSession();
  if (!session) redirect(`${process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net"}`);
  const notifications = await prisma.notification.findMany({
    where: { userId: session.forumUserId },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: { actor: true },
  });
  await prisma.notification.updateMany({
    where: { userId: session.forumUserId, readAt: null },
    data: { readAt: new Date() },
  });

  return (
    <div className="container" style={{ display: "grid", gap: 12 }}>
      <h1 style={{ margin: 0 }}>Notifications</h1>
      {notifications.map((n) => (
        <Link key={n.id} href={n.href || "#"} className="card" style={{ padding: "0.9rem", opacity: n.readAt ? 0.75 : 1 }}>
          <div style={{ fontWeight: 700 }}>{n.title}</div>
          {n.body && <div className="muted">{n.body}</div>}
          <div className="muted" style={{ fontSize: "0.78rem", marginTop: 4 }}>{n.createdAt.toLocaleString()}</div>
        </Link>
      ))}
      {!notifications.length && <div className="muted">No notifications yet.</div>}
    </div>
  );
}
