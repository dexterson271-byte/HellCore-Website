import Link from "next/link";
import { ForumSidebar } from "@/components/ForumSidebar";
import { ForumCategorySection } from "@/components/ForumCategorySection";
import { ForumStatsFooter } from "@/components/ForumStatsFooter";
import { getForumIndexData } from "@/lib/forum-data";

export const dynamic = "force-dynamic";

export default async function ForumsPage() {
  const { groups, latestByCategory, session, userProfile, onlineUsers, latestPosts, stats } = await getForumIndexData();

  return (
    <main className="page">
      <div className="content">
        <section className="main-column">
          <div className="breadcrumb">
            <Link href="/">Home</Link> › <strong>Forum list</strong>
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
