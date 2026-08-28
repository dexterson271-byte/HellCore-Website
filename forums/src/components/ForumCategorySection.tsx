import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { categoryIconClass } from "@/lib/forum-data";
import { UserAvatar, Username } from "@/components/UserAvatar";

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
  author: {
    username: string;
    mcUsername?: string | null;
    role?: string;
    avatarUrl?: string | null;
  };
};

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2).replace(/\.?0+$/, "")}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(2).replace(/\.?0+$/, "")}K`;
  return n.toLocaleString();
}

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
    <section className="forum-section">
      <h2 className="forum-section-title">{groupName}</h2>
      {categories.map((c) => {
        const latest = latestByCategory.get(c.id);
        const iconClass = categoryIconClass(c.slug, c.name);
        return (
          <div key={c.id} className="forum-row">
            <div className={`forum-icon ${iconClass}`} aria-hidden />
            <div className="forum-info">
              <h3>
                <Link href={`/c/${c.slug}`}>{c.name}</Link>
              </h3>
              {c.description && <p>{c.description}</p>}
            </div>
            <div className="forum-stats">
              <div className="stat-col">
                <small>Threads</small>
                <strong>{formatCount(c.threadCount)}</strong>
              </div>
              <div className="stat-col">
                <small>Messages</small>
                <strong>{formatCount(c.postCount)}</strong>
              </div>
            </div>
            <div className="last-post">
              {latest ? (
                <div className="last-post-inner">
                  <UserAvatar
                    username={latest.author.username}
                    mcUsername={latest.author.mcUsername}
                    avatarUrl={latest.author.avatarUrl}
                    size={36}
                  />
                  <div className="last-post-text">
                    <Link href={`/t/${latest.id}/${latest.slug}`}>
                      <strong>{latest.title}</strong>
                    </Link>
                    <small>
                      {formatDistanceToNow(new Date(latest.lastActivityAt), { addSuffix: true })}
                      {" · "}
                      <Username username={latest.author.username} role={latest.author.role} />
                    </small>
                  </div>
                </div>
              ) : (
                <small>No posts yet</small>
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
