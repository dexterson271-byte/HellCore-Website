import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

type ThreadCardProps = {
  id: number;
  title: string;
  slug: string;
  replyCount: number;
  views: number;
  isPinned?: boolean;
  isLocked?: boolean;
  isSolved?: boolean;
  isFeatured?: boolean;
  lastActivityAt: string | Date;
  author: { username: string; level?: number };
  category?: { name: string; slug: string; color?: string };
};

export function ThreadCard(t: ThreadCardProps) {
  return (
    <Link href={`/t/${t.id}/${t.slug}`} className="card" style={{ display: "block", padding: "1rem 1.1rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
            {t.isPinned && <span className="tag">Pinned</span>}
            {t.isLocked && <span className="tag">Locked</span>}
            {t.isSolved && <span className="tag" style={{ background: "rgba(48,209,88,0.15)", color: "#86efac" }}>Solved</span>}
            {t.isFeatured && <span className="tag">Featured</span>}
            {t.category && (
              <span className="tag" style={{ background: `${t.category.color || "#FF6B2C"}22`, color: t.category.color || "#FF6B2C" }}>
                {t.category.name}
              </span>
            )}
          </div>
          <div style={{ fontWeight: 800, fontSize: "1.05rem", marginBottom: 6 }}>{t.title}</div>
          <div className="muted" style={{ fontSize: "0.82rem" }}>
            by {t.author.username}
            {t.author.level ? ` · L${t.author.level}` : ""} · {formatDistanceToNow(new Date(t.lastActivityAt), { addSuffix: true })}
          </div>
        </div>
        <div style={{ textAlign: "right", fontSize: "0.8rem", color: "var(--tx2)", whiteSpace: "nowrap" }}>
          <div>{t.replyCount} replies</div>
          <div>{t.views} views</div>
        </div>
      </div>
    </Link>
  );
}
