"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ThreadPost,
  flattenThreadPosts,
} from "@/lib/thread-ui";
import { ThreadPagination, ThreadPostCard } from "./ThreadPost";

const POSTS_PER_PAGE = 10;

export function ThreadClient({
  threadId,
  slug,
  initialPosts,
  locked,
  canModerate,
  isAuthor,
  bookmarked,
  following,
  poll,
}: {
  threadId: number;
  slug: string;
  initialPosts: ThreadPost[];
  locked: boolean;
  canModerate: boolean;
  isAuthor: boolean;
  bookmarked: boolean;
  following: boolean;
  poll?: { id: number; question: string; options: { id: number; label: string; votes: number }[] } | null;
}) {
  const [posts, setPosts] = useState(initialPosts);
  const [content, setContent] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [pending, setPending] = useState(0);
  const [bm, setBm] = useState(bookmarked);
  const [fol, setFol] = useState(following);
  const [pollState, setPollState] = useState(poll || null);
  const [error, setError] = useState("");
  const [page, setPage] = useState(1);

  const flatPosts = useMemo(() => flattenThreadPosts(posts), [posts]);
  const totalPages = Math.max(1, Math.ceil(flatPosts.length / POSTS_PER_PAGE));
  const pagePosts = flatPosts.slice((page - 1) * POSTS_PER_PAGE, page * POSTS_PER_PAGE);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1";
    if (!key) return;
    let pusher: { unsubscribe: (c: string) => void; subscribe: (c: string) => { bind: (e: string, cb: (d: { post: ThreadPost }) => void) => void } } | null = null;
    import("pusher-js").then(({ default: Pusher }) => {
      pusher = new Pusher(key, { cluster }) as unknown as typeof pusher;
      const ch = pusher!.subscribe(`thread-${threadId}`);
      ch.bind("new-reply", (data: { post: ThreadPost }) => {
        setPending((n) => n + 1);
        setPosts((prev) => {
          if (findPost(prev, data.post.id)) return prev;
          if (data.post.parentId) {
            return prev.map((p) =>
              p.id === data.post.parentId
                ? { ...p, children: [...(p.children || []), data.post] }
                : p,
            );
          }
          return [...prev, data.post];
        });
        setPage(Math.ceil((flatPosts.length + 1) / POSTS_PER_PAGE));
      });
    });
    return () => {
      try { pusher?.unsubscribe(`thread-${threadId}`); } catch { /* */ }
    };
  }, [threadId, flatPosts.length]);

  function findPost(list: ThreadPost[], id: number): ThreadPost | undefined {
    for (const p of list) {
      if (p.id === id) return p;
      const child = p.children?.find((c) => c.id === id);
      if (child) return child;
    }
    return undefined;
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/threads/${threadId}/replies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentId }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setContent("");
    setParentId(null);
    setPending(0);
    setPosts((prev) => {
      const post = data.post as ThreadPost;
      if (post.parentId) {
        return prev.map((p) =>
          p.id === post.parentId ? { ...p, children: [...(p.children || []), post] } : p,
        );
      }
      return [...prev, post];
    });
    setPage(Math.ceil((flatPosts.length + 1) / POSTS_PER_PAGE));
  }

  async function react(postId: number, type: string) {
    await fetch(`/api/posts/${postId}/reactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    const res = await fetch(`/api/threads/${threadId}`);
    const data = await res.json();
    if (data.posts) setPosts(data.posts);
  }

  async function toggle(kind: "bookmark" | "follow") {
    const res = await fetch(`/api/threads/${threadId}/${kind}`, { method: "POST" });
    const data = await res.json();
    if (kind === "bookmark") setBm(!!data.bookmarked);
    else setFol(!!data.following);
  }

  async function mod(patch: Record<string, unknown>) {
    await fetch(`/api/threads/${threadId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    window.location.reload();
  }

  async function report() {
    const reason = prompt("Report reason?");
    if (!reason) return;
    await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threadId, reason }),
    });
    alert("Report submitted");
  }

  async function vote(optionId: number) {
    if (!pollState) return;
    const res = await fetch(`/api/polls/${pollState.id}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionId }),
    });
    const data = await res.json();
    if (data.poll) setPollState(data.poll);
  }

  function handleReply(post: ThreadPost) {
    setParentId(post.id);
    setContent("");
    document.getElementById("thread-reply-form")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleQuote(post: ThreadPost) {
    setParentId(post.id);
    const plain = (post.bodyHtml || post.body).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 280);
    setContent(`> ${post.author.username} said:\n> ${plain}\n\n`);
    document.getElementById("thread-reply-form")?.scrollIntoView({ behavior: "smooth" });
  }

  return (
    <div className="thread-view">
      <div className="thread-toolbar">
        <button type="button" className="thread-tool-btn" onClick={() => toggle("bookmark")}>
          {bm ? "Bookmarked" : "Bookmark"}
        </button>
        <button type="button" className="thread-tool-btn" onClick={() => toggle("follow")}>
          {fol ? "Following" : "Follow"}
        </button>
        {(canModerate || isAuthor) && (
          <button type="button" className="thread-tool-btn" onClick={() => mod({ isSolved: true })}>
            Mark solved
          </button>
        )}
        {canModerate && (
          <>
            <button type="button" className="thread-tool-btn" onClick={() => mod({ isPinned: true })}>Pin</button>
            <button type="button" className="thread-tool-btn" onClick={() => mod({ isLocked: true })}>Lock</button>
            <button type="button" className="thread-tool-btn" onClick={() => mod({ isFeatured: true })}>Feature</button>
          </>
        )}
        <button type="button" className="thread-tool-btn" onClick={report}>Report</button>
      </div>

      {locked && (
        <div className="thread-locked-bar">
          This thread is not open for further replies.
        </div>
      )}

      {pending > 0 && (
        <button type="button" className="thread-live-btn" onClick={() => setPending(0)}>
          {pending} new {pending === 1 ? "reply" : "replies"} — showing live
        </button>
      )}

      {pollState && (
        <div className="thread-poll">
          <h3>{pollState.question}</h3>
          <div className="thread-poll-options">
            {pollState.options.map((o) => (
              <button key={o.id} type="button" className="thread-poll-option" onClick={() => vote(o.id)}>
                <span>{o.label}</span>
                <span className="muted">{o.votes} votes</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <ThreadPagination page={page} totalPages={totalPages} onChange={setPage} />

      <div className="thread-posts">
        {pagePosts.map((post, i) => {
          const postNumber = (page - 1) * POSTS_PER_PAGE + i + 1;
          return (
            <ThreadPostCard
              key={post.id}
              post={post}
              postNumber={postNumber}
              onReply={handleReply}
              onQuote={handleQuote}
              onReact={react}
              onReport={report}
              onBest={canModerate || isAuthor ? () => mod({ bestAnswerId: post.id }) : undefined}
            />
          );
        })}
      </div>

      <ThreadPagination page={page} totalPages={totalPages} onChange={setPage} />

      {!locked ? (
        <form id="thread-reply-form" onSubmit={submit} className="thread-reply-form">
          <div className="thread-reply-head">
            {parentId ? `Replying to #${parentId}` : "Post a reply"}
          </div>
          {error && <div className="post-thread-error">{error}</div>}
          <textarea
            className="thread-reply-editor"
            rows={8}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Write your reply… Markdown supported"
            required
          />
          <div className="thread-reply-actions">
            {parentId && (
              <button type="button" className="btn" onClick={() => { setParentId(null); setContent(""); }}>
                Cancel quote
              </button>
            )}
            <button className="btn primary" type="submit">Post reply</button>
          </div>
        </form>
      ) : (
        <div className="thread-locked-note muted">This thread is locked.</div>
      )}

      <div className="thread-url-slug muted">/t/{threadId}/{slug}</div>
    </div>
  );
}
