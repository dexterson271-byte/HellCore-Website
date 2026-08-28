import Link from "next/link";
import { ForumSidebar } from "@/components/ForumSidebar";
import { ForumCategorySection } from "@/components/ForumCategorySection";
import { getForumIndexData } from "@/lib/forum-data";

export const dynamic = "force-dynamic";

export default async function ForumsPage() {
  const { groups, latestByCategory, session, userProfile, onlineUsers, latestPosts, stats } = await getForumIndexData();

  return (
    <div className="container forum-layout">
      <div>
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

          {!groups.length && (
            <div style={{ padding: "2rem", textAlign: "center" }} className="muted">
              No forum categories yet. Check back soon.
            </div>
          )}
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
