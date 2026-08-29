"use client";

import Link from "next/link";
import { avatarUrl } from "@/lib/avatars";
import {
  THREAD_REACTIONS,
  ThreadPost,
  avatarRankClass,
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
  threadId,
  slug,
  onReply,
  onQuote,
  onReact,
  onReport,
  onBest,
}: {
  post: ThreadPost;
  postNumber: number;
  threadId: number;
  slug: string;
  onReply: (post: ThreadPost) => void;
  onQuote: (post: ThreadPost) => void;
  onReact: (postId: number, type: string) => void;
  onReport?: () => void;
  onBest?: () => void;
}) {
  const author = post.author;
  const src = author.avatarUrl || avatarUrl(author.username, author.mcUsername, 96);
  const rep = author.reputation ?? 0;
  const positive = Math.max(0, rep);
  const negative = Math.max(0, Math.floor(rep * 0.15));
  const total = positive + negative || 1;
  const posPct = (positive / total) * 100;

  return (
    <article
      className={`message message--post js-post${post.isBestAnswer ? " message--best" : ""}`}
      id={`js-post-${post.id}`}
      data-author={author.username}
      data-content={`post-${post.id}`}
    >
      <span className="u-anchorTarget" id={`post-${post.id}`} />

      <div className="message-inner">
        <div className="message-cell message-cell--user">
          <section className="message-user" itemScope itemType="https://schema.org/Person">
            <div className={`message-avatar ${avatarRankClass(author.role)}`}>
              <div className="message-avatar-wrapper">
                <Link href={`/u/${author.username}`} className="avatar avatar--m">
                  <img src={src} alt={author.username} width={96} height={96} loading="lazy" />
                </Link>
              </div>
            </div>

            <div className={`message-userDetails message-userDetails-rank-${author.role.toUpperCase()}`}>
              <h4 className="message-name">
                <Link href={`/u/${author.username}`} className="username" style={{ color: roleColor(author.role) }}>
                  <span itemProp="name">{author.username}</span>
                </Link>
              </h4>
              <h5 className="userTitle message-userTitle">{roleLabel(author.role)}</h5>

              <div className="sv-rating-count-bar">
                <div
                  className="sv-rating-count-bar__fragment sv-rating-type-category2--background"
                  style={{ width: `${posPct}%` }}
                  title={`Positive (${positive})`}
                />
                <div
                  className="sv-rating-count-bar__fragment sv-rating-type-category1--background"
                  style={{ width: `${100 - posPct}%` }}
                  title={`Negative (${negative})`}
                />
              </div>

              {isStaffRole(author.role) && staffBadgeLabel(author.role) && (
                <div className="message-userDetails-block message-userDetails-block--staff">
                  {staffBadgeLabel(author.role)}
                </div>
              )}
            </div>

            <div className="message-userExtras">
              <dl className="pairs pairs--justified">
                <dt>Joined</dt>
                <dd>{formatJoinDate(author.createdAt)}</dd>
              </dl>
              <dl className="pairs pairs--justified">
                <dt>Messages</dt>
                <dd>{author.postCount ?? 0}</dd>
              </dl>
              <dl className="pairs pairs--justified">
                <dt>Reaction score</dt>
                <dd>{author.reputation ?? 0}</dd>
              </dl>
            </div>
          </section>
        </div>

        <div className="message-cell message-cell--main">
          <div className="message-main js-quickEditTarget">
            <header className="message-attribution message-attribution--split">
              <ul className="message-attribution-main listInline">
                <li className="u-concealed">
                  <Link href={`/t/${threadId}/${slug}#post-${post.id}`}>
                    <time dateTime={post.createdAt}>{formatPostDate(post.createdAt)}</time>
                  </Link>
                </li>
              </ul>
              <ul className="message-attribution-opposite message-attribution-opposite--list">
                {post.isBestAnswer && <li><span className="tag solved">Best</span></li>}
                <li>
                  <Link href={`/t/${threadId}/${slug}#post-${post.id}`}>#{postNumber}</Link>
                </li>
              </ul>
            </header>

            <div className="message-content js-messageContent">
              <div className="message-userContent lbContainer js-lbContainer" data-lb-id={`post-${post.id}`}>
                <article className="message-body js-selectToQuote">
                  <div itemProp="text">
                    <div className="bbWrapper">
                      {post.quoteFrom && (
                        <blockquote className="bbCodeBlock bbCodeBlock--expandable bbCodeBlock--quote js-expandWatch">
                          <div className="bbCodeBlock-title">
                            <a href={`#post-${post.quoteFrom.id}`} className="bbCodeBlock-sourceJump" rel="nofollow">
                              {post.quoteFrom.author.username} said:
                            </a>
                          </div>
                          <div className="bbCodeBlock-content">
                            <div
                              className="bbCodeBlock-expandContent js-expandContent"
                              dangerouslySetInnerHTML={{
                                __html: post.quoteFrom.bodyHtml || post.quoteFrom.body,
                              }}
                            />
                          </div>
                        </blockquote>
                      )}
                      <div dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.body }} />
                    </div>
                  </div>
                  <div className="js-selectToQuoteEnd">&nbsp;</div>
                </article>
              </div>
            </div>

            <footer className="message-footer">
              <div className="message-actionBar actionBar">
                <div className="actionBar-set actionBar-set--external">
                  <button type="button" className="actionBar-action actionBar-action--report" onClick={() => onReport?.()}>
                    Report
                  </button>
                </div>
                <div className="actionBar-set actionBar-set--internal">
                  <button type="button" className="actionBar-action actionBar-action--quote" onClick={() => onQuote(post)}>
                    Quote
                  </button>
                  <button type="button" className="actionBar-action actionBar-action--reply" onClick={() => onReply(post)}>
                    Reply
                  </button>
                </div>
              </div>

              <div className="sv-rating-bar sv-rating-bar--ratings-left js-ratingBar">
                {THREAD_REACTIONS.map((r) => {
                  const count = post.reactions.filter((x) => x.type === r.type).length;
                  return (
                    <button
                      key={r.type}
                      type="button"
                      className={`reactionButton${count ? " has-count" : ""}`}
                      title={r.label}
                      onClick={() => onReact(post.id, r.type)}
                    >
                      <span
                        className="reaction-sprite"
                        style={{ backgroundPosition: `0 ${-r.sprite * 16}px` }}
                        aria-hidden
                      />
                      {count > 0 && <span className="reaction-count">{count}</span>}
                    </button>
                  );
                })}
              </div>

              {onBest && (
                <div style={{ paddingTop: 8 }}>
                  <button type="button" className="actionBar-action actionBar-action--quote" onClick={onBest}>
                    Mark best answer
                  </button>
                </div>
              )}
            </footer>
          </div>
        </div>
      </div>
    </article>
  );
}

export function ThreadPagination({
  threadId,
  slug,
  page,
  totalPages,
}: {
  threadId: number;
  slug: string;
  page: number;
  totalPages: number;
}) {
  if (totalPages <= 1) return null;

  const base = `/t/${threadId}/${slug}`;
  const pageHref = (n: number) => (n <= 1 ? `${base}#posts` : `${base}?page=${n}#posts`);
  const prevHref = page <= 2 ? `${base}#posts` : `${base}?page=${page - 1}#posts`;

  return (
    <div className="block-outer">
      <div className="block-outer-main">
        <nav className="pageNavWrapper pageNavWrapper--mixed" aria-label="Post pages">
          <div className="pageNav">
            {page > 1 && (
              <Link href={prevHref} className="pageNav-jump pageNav-jump--prev">
                Prev
              </Link>
            )}
            <ul className="pageNav-main">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
                <li key={n} className={`pageNav-page${n === page ? " pageNav-page--current" : ""}`}>
                  <Link href={pageHref(n)}>{n}</Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </div>
    </div>
  );
}
