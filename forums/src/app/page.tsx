import Link from "next/link";
import { ForumSidebar } from "@/components/ForumSidebar";
import { ForumCategorySection } from "@/components/ForumCategorySection";
import { ThreadRow } from "@/components/ThreadCard";
import { getForumIndexData } from "@/lib/forum-data";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const data = await getForumIndexData();
  const { groups, latestByCategory, session, userProfile, onlineUsers, latestPosts, stats } = data;

  const announcements = await prisma.thread.findMany({
    where: { deletedAt: null, isAnnouncement: true },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { author: { select: { username: true, mcUsername: true, role: true, avatarUrl: true, level: true } } },
  });

  return (
    <div className="container forum-layout">
      <div style={{ display: "grid", gap: 16 }}>
        {announcements.length > 0 && (
          <div className="forum-frame">
            <div className="forum-toolbar">
              <div className="breadcrumb">
                <strong>Staff Announcements</strong>
              </div>
            </div>
            {announcements.map((a) => (
              <ThreadRow key={a.id} {...a} showCategory={false} />
            ))}
          </div>
        )}

        <div className="forum-frame">
          <div className="forum-toolbar">
            <div className="breadcrumb">
              <Link href="/">Home</Link> <span className="muted">›</span> <strong>Forum list</strong>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Link href="/discover?tab=new" className="btn-ghost btn-sm">New posts</Link>
              <Link href="/new" className="btn btn-sm">Post thread…</Link>
            </div>
          </div>

          <div className="forum-col-headers">
            <span />
            <span>Forum</span>
            <span className="col-stat">Threads</span>
            <span className="col-stat">Messages</span>
            <span className="col-latest">Latest post</span>
          </div>

          {groups.map((g) => (
            <ForumCategorySection
              key={g.id}
              groupName={g.name}
              categories={g.categories}
              latestByCategory={latestByCategory}
            />
          ))}
        </div>
      </div>

      <ForumSidebar
        user={session}
        userProfile={userProfile}
        onlineUsers={onlineUsers}
        latestPosts={latestPosts}
        stats={stats}
      />
    </div>
  );
}
