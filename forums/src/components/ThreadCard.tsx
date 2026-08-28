import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { avatarUrl } from "@/lib/avatars";

type ThreadRowProps = {
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
  author: { username: string; mcUsername?: string | null; level?: number };
  category?: { name: string; slug: string; color?: string };
  showCategory?: boolean;
};

export function ThreadRow(t: ThreadRowProps) {
  return (
    <div className="forum-row thread-row">
      <div className="forum-row-main">
        <div className="thread-states">
          {t.isPinned && <span className="tag">Pinned</span>}
          {t.isLocked && <span className="tag">Locked</span>}
          {t.isSolved && (
            <span className="tag" style={{ background: "rgba(74,222,128,0.12)", color: "var(--good)", borderColor: "rgba(74,222,128,0.25)" }}>
              Solved
            </span>
          )}
          {t.isFeatured && <span className="tag">Featured</span>}
          {t.showCategory && t.category && (
            <Link href={`/c/${t.category.slug}`} className="tag" style={{ background: `${t.category.color || "#d4af37"}18`, color: t.category.color || "var(--gold)" }}>
              {t.category.name}
            </Link>
          )}
        </div>
        <Link href={`/t/${t.id}/${t.slug}`} className="forum-row-title">
          {t.title}
        </Link>
        <div className="forum-row-desc">
          <img
            className="user-avatar-sm"
            src={avatarUrl(t.author.username, t.author.mcUsername, 28)}
            alt=""
            style={{ display: "inline-block", verticalAlign: "middle", marginRight: 6 }}
          />
          <Link href={`/u/${t.author.username}`} style={{ color: "var(--gold-light)", fontWeight: 700 }}>
            {t.author.username}
          </Link>
          {t.author.level ? ` · L${t.author.level}` : ""}
          {" · "}
          {formatDistanceToNow(new Date(t.lastActivityAt), { addSuffix: true })}
        </div>
      </div>
      <div className="forum-row-stats">
        <div className="num">{t.replyCount}</div>
        <div className="lbl">Replies</div>
      </div>
      <div className="forum-row-stats">
        <div className="num">{t.views.toLocaleString()}</div>
        <div className="lbl">Views</div>
      </div>
    </div>
  );
}

/** Compact card for discover/home feeds */
export function ThreadCard(t: ThreadRowProps) {
  return <ThreadRow {...t} showCategory />;
}
