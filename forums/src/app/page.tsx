import Link from "next/link";
import { ForumSidebar } from "@/components/ForumSidebar";
import { ForumCategorySection } from "@/components/ForumCategorySection";
import { ForumStatsFooter } from "@/components/ForumStatsFooter";
import { WelcomeBanner } from "@/components/WelcomeBanner";
import { getForumIndexData } from "@/lib/forum-data";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { groups, latestByCategory, session, userProfile, onlineUsers, latestPosts, stats } = await getForumIndexData();

  return (
    <main className="page">
      <div className="content">
        <section className="main-column">
          {!session && <WelcomeBanner />}

          <div className="breadcrumb">
            Home › <strong>Forum list</strong>
          </div>

          <div className="forum-header">
            <Link href="/discover?tab=new" className="btn">New posts</Link>
            <Link href="/new" className="btn primary">POST THREAD...</Link>
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
            <section className="forum-section">
              <h2 className="forum-section-title">Categories</h2>
              <div style={{ padding: "2rem", textAlign: "center", color: "#888" }}>
                No categories yet. Run <code>npm run db:seed</code> on the server.
              </div>
            </section>
          )}

          <ForumStatsFooter members={stats.members} threads={stats.threads} posts={stats.posts} />
        </section>

        <ForumSidebar
          user={session}
          userProfile={userProfile}
          onlineUsers={onlineUsers}
          latestPosts={latestPosts}
          stats={stats}
        />
      </div>
    </main>
  );
}
