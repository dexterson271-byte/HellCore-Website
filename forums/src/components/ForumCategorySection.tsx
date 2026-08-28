import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { categoryIcon } from "@/lib/forum-data";

type Category = {
  id: number;
  name: string;
  slug: string;
  description?: string | null;
  icon?: string | null;
  color: string;
  threadCount: number;
  postCount: number;
};

type LatestThread = {
  id: number;
  title: string;
  slug: string;
  lastActivityAt: Date;
  author: { username: string };
};

export function ForumCategorySection({
  groupName,
  categories,
  latestByCategory,
}: {
  groupName: string;
  categories: Category[];
  latestByCategory: Map<number, LatestThread>;
}) {
  if (!categories.length) return null;

  return (
    <section className="forum-group">
      <h2 className="forum-group-title">{groupName}</h2>
      {categories.map((c) => {
        const latest = latestByCategory.get(c.id);
        return (
          <div key={c.id} className="forum-row">
            <div className="forum-row-icon" style={{ color: c.color }}>
              {categoryIcon(c.icon, c.name)}
            </div>
            <div className="forum-row-main">
              <Link href={`/c/${c.slug}`} className="forum-row-title" style={{ color: c.color }}>
                {c.name}
              </Link>
              {c.description && <div className="forum-row-desc">{c.description}</div>}
            </div>
            <div className="forum-row-stats">
              <div className="num">{c.threadCount.toLocaleString()}</div>
              <div className="lbl">Threads</div>
            </div>
            <div className="forum-row-stats">
              <div className="num">{c.postCount.toLocaleString()}</div>
              <div className="lbl">Messages</div>
            </div>
            <div className="forum-row-latest">
              {latest ? (
                <>
                  <Link href={`/t/${latest.id}/${latest.slug}`} className="thread-title">
                    {latest.title}
                  </Link>
                  <div className="meta">
                    <Link href={`/u/${latest.author.username}`}>{latest.author.username}</Link>
                    {" · "}
                    {formatDistanceToNow(new Date(latest.lastActivityAt), { addSuffix: true })}
                  </div>
                </>
              ) : (
                <span className="muted">No posts yet</span>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
