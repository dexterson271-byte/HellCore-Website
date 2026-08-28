"use client";

import Link from "next/link";
import { avatarUrl } from "@/lib/avatars";
import {
  THREAD_REACTIONS,
  ThreadPost,
  avatarFrameClass,
  formatJoinDate,
  formatPostDate,
  isStaffRole,
  roleColor,
  roleLabel,
  staffBadgeLabel,
} from "@/lib/thread-ui";

export function ThreadPostCard({
  post,
  postNumber,
  onReply,
  onQuote,
  onReact,
  onReport,
  onBest,
}: {
  post: ThreadPost;
  postNumber: number;
  onReply: (post: ThreadPost) => void;
  onQuote: (post: ThreadPost) => void;
  onReact: (postId: number, type: string) => void;
  onReport?: () => void;
  onBest?: () => void;
}) {
  const author = post.author;
  const src = author.avatarUrl || avatarUrl(author.username, author.mcUsername, 96);
  const activeReactions = THREAD_REACTIONS.filter(
    (r) => post.reactions.some((x) => x.type === r.type),
  );

  return (
    <article className={`thread-post${post.isBestAnswer ? " best-answer" : ""}`} id={`post-${post.id}`}>
      <aside className="thread-post-sidebar">
        <div className={avatarFrameClass(author.role)}>
          <img src={src} alt={author.username} width={96} height={96} />
          <span className="post-frame-badge">{isStaffRole(author.role) ? "STAFF" : author.role.toUpperCase() === "VIP" ? "VIP" : `L${author.level}`}</span>
        </div>

        <Link
          href={`/u/${author.username}`}
          className="thread-post-username"
          style={{ color: roleColor(author.role) }}
        >
          {author.username}
        </Link>
        <div className="thread-post-rank">{roleLabel(author.role)}</div>

        {isStaffRole(author.role) && staffBadgeLabel(author.role) && (
          <div className="thread-post-staff-badge">{staffBadgeLabel(author.role)}</div>
        )}

        <div className="thread-post-rank-bar">
          <span style={{ width: `${Math.min(100, (author.reputation || 0) % 100)}%` }} />
        </div>

        <dl className="thread-post-stats">
          <div>
            <dt>Joined</dt>
            <dd>{formatJoinDate(author.createdAt)}</dd>
          </div>
          <div>
            <dt>Messages</dt>
            <dd>{author.postCount ?? 0}</dd>
          </div>
          <div>
            <dt>Reaction score</dt>
            <dd>{author.reputation ?? 0}</dd>
          </div>
        </dl>
      </aside>

      <div className="thread-post-main">
        <header className="thread-post-head">
          <time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time>
          <div className="thread-post-head-actions">
            {post.isBestAnswer && <span className="thread-post-new">Best</span>}
            <span className="thread-post-num">#{postNumber}</span>
          </div>
        </header>

        <div className="thread-post-body">
          {post.isBestAnswer && <div className="thread-best-tag">Best Answer</div>}

          {post.quoteFrom && (
            <blockquote className="thread-quote">
              <strong>{post.quoteFrom.author.username} said:</strong>
              <div
                dangerouslySetInnerHTML={{
                  __html: post.quoteFrom.bodyHtml || post.quoteFrom.body,
                }}
              />
            </blockquote>
          )}

          <div
            className="prose thread-post-content"
            dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.body }}
          />
        </div>

        <footer className="thread-post-foot">
          <button type="button" className="thread-foot-link" onClick={() => onReport?.()}>
            Report
          </button>

          <div className="thread-post-foot-right">
            <button type="button" className="thread-foot-btn" onClick={() => onQuote(post)}>
              + Quote
            </button>
            <button type="button" className="thread-foot-btn primary" onClick={() => onReply(post)}>
              Reply
            </button>
          </div>
        </footer>

        <div className="thread-reactions">
          {THREAD_REACTIONS.map((r) => {
            const count = post.reactions.filter((x) => x.type === r.type).length;
            return (
              <button
                key={r.type}
                type="button"
                className={`thread-reaction-btn${count ? " has-count" : ""}`}
                title={r.label}
                onClick={() => onReact(post.id, r.type)}
              >
                <span className="thread-reaction-emoji">{r.emoji}</span>
                {count > 0 && <span className="thread-reaction-count">{count}</span>}
              </button>
            );
          })}
        </div>

        {!!activeReactions.length && (
          <div className="thread-reaction-summary">
            {activeReactions.map((r) => (
              <span key={r.type} title={r.label}>
                {r.emoji}
              </span>
            ))}
          </div>
        )}

        {onBest && (
          <div className="thread-mod-actions">
            <button type="button" className="thread-foot-btn" onClick={onBest}>
              Mark best answer
            </button>
          </div>
        )}
      </div>
    </article>
  );
}

export function ThreadPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav className="thread-pagination" aria-label="Post pages">
      <button type="button" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Prev
      </button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          className={n === page ? "active" : ""}
          onClick={() => onChange(n)}
        >
          {n}
        </button>
      ))}
      <button type="button" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next
      </button>
    </nav>
  );
}
