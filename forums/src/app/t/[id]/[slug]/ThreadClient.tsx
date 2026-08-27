"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Author = { id: number; username: string; role: string; level: number; avatarUrl?: string | null; reputation?: number };
type Reaction = { type: string; userId: number };
type Post = {
  id: number;
  parentId?: number | null;
  body: string;
  bodyHtml?: string | null;
  isBestAnswer?: boolean;
  depth: number;
  createdAt: string;
  author: Author;
  reactions: Reaction[];
  children?: Post[];
};

const REACTIONS = ["LIKE", "LOVE", "FIRE", "FUNNY", "WOW", "DISLIKE"] as const;

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
  initialPosts: Post[];
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

  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_PUSHER_KEY;
    const cluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER || "ap1";
    if (!key) return;
    let pusher: { unsubscribe: (c: string) => void; subscribe: (c: string) => { bind: (e: string, cb: (d: { post: Post }) => void) => void } } | null = null;
    import("pusher-js").then(({ default: Pusher }) => {
      pusher = new Pusher(key, { cluster }) as unknown as typeof pusher;
      const ch = pusher!.subscribe(`thread-${threadId}`);
      ch.bind("new-reply", (data: { post: Post }) => {
        setPending((n) => n + 1);
        setPosts((prev) => {
          if (prev.some((p) => p.id === data.post.id)) return prev;
          if (data.post.parentId) {
            return prev.map((p) =>
              p.id === data.post.parentId
                ? { ...p, children: [...(p.children || []), data.post] }
                : p
            );
          }
          return [...prev, data.post];
        });
      });
    });
    return () => {
      try { pusher?.unsubscribe(`thread-${threadId}`); } catch { /* */ }
    };
  }, [threadId]);

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
      const post = data.post as Post;
      if (post.parentId) {
        return prev.map((p) => (p.id === post.parentId ? { ...p, children: [...(p.children || []), post] } : p));
      }
      return [...prev, post];
    });
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

  const flatCount = useMemo(() => posts.reduce((n, p) => n + 1 + (p.children?.length || 0), 0), [posts]);

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button className="btn-ghost" onClick={() => toggle("bookmark")}>{bm ? "Bookmarked" : "Bookmark"}</button>
        <button className="btn-ghost" onClick={() => toggle("follow")}>{fol ? "Following" : "Follow"}</button>
        {(canModerate || isAuthor) && (
          <button className="btn-ghost" onClick={() => mod({ isSolved: true })}>Mark solved</button>
        )}
        {canModerate && (
          <>
            <button className="btn-ghost" onClick={() => mod({ isPinned: true })}>Pin</button>
            <button className="btn-ghost" onClick={() => mod({ isLocked: true })}>Lock</button>
            <button className="btn-ghost" onClick={() => mod({ isFeatured: true })}>Feature</button>
          </>
        )}
        <button
          className="btn-ghost"
          onClick={async () => {
            const reason = prompt("Report reason?");
            if (!reason) return;
            await fetch("/api/reports", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ threadId, reason }),
            });
            alert("Report submitted");
          }}
        >
          Report
        </button>
      </div>

      {pending > 0 && (
        <button className="btn" onClick={() => setPending(0)}>
          {pending} new {pending === 1 ? "reply" : "replies"} — showing live
        </button>
      )}

      {pollState && (
        <div className="card" style={{ padding: "1rem" }}>
          <h3 style={{ marginTop: 0 }}>{pollState.question}</h3>
          <div style={{ display: "grid", gap: 8 }}>
            {pollState.options.map((o) => (
              <button key={o.id} className="btn-ghost" style={{ justifyContent: "space-between" }} onClick={() => vote(o.id)}>
                <span>{o.label}</span>
                <span className="muted">{o.votes} votes</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 12 }}>
        {posts.map((p) => (
          <PostBlock
            key={p.id}
            post={p}
            onReply={(id) => setParentId(id)}
            onReact={react}
            onBest={canModerate || isAuthor ? () => mod({ bestAnswerId: p.id }) : undefined}
          />
        ))}
      </div>

      {!locked ? (
        <form onSubmit={submit} className="card" style={{ padding: "1rem", display: "grid", gap: 10 }}>
          <div style={{ fontWeight: 700 }}>Reply {parentId ? `(to #${parentId})` : ""} · {flatCount} posts</div>
          {error && <div style={{ color: "var(--bad)" }}>{error}</div>}
          <textarea className="input" rows={5} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Write a reply… Markdown supported" required />
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn" type="submit">Post reply</button>
            {parentId && <button type="button" className="btn-ghost" onClick={() => setParentId(null)}>Cancel quote</button>}
          </div>
        </form>
      ) : (
        <div className="muted">This thread is locked.</div>
      )}
      <div className="muted" style={{ fontSize: "0.8rem" }}>Thread URL slug: /t/{threadId}/{slug}</div>
    </div>
  );
}

function PostBlock({
  post,
  onReply,
  onReact,
  onBest,
}: {
  post: Post;
  onReply: (id: number) => void;
  onReact: (id: number, type: string) => void;
  onBest?: () => void;
}) {
  const counts = REACTIONS.map((t) => [t, post.reactions.filter((r) => r.type === t).length] as const);
  return (
    <article className="card" style={{ padding: "1rem", marginLeft: post.depth ? Math.min(post.depth, 4) * 16 : 0, borderColor: post.isBestAnswer ? "rgba(48,209,88,0.45)" : undefined }}>
      {post.isBestAnswer && <div className="tag" style={{ marginBottom: 8, background: "rgba(48,209,88,0.15)", color: "#86efac" }}>Best Answer</div>}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
        <div style={{ fontWeight: 700 }}>
          {post.author.username} <span className="muted">L{post.author.level} · {post.author.role}</span>
        </div>
        <div className="muted" style={{ fontSize: "0.8rem" }}>#{post.id}</div>
      </div>
      <div className="prose" dangerouslySetInnerHTML={{ __html: post.bodyHtml || post.body }} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
        {counts.map(([t, n]) => (
          <button key={t} className="btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }} onClick={() => onReact(post.id, t)}>
            {t.toLowerCase()} {n || ""}
          </button>
        ))}
        <button className="btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }} onClick={() => onReply(post.id)}>Reply</button>
        {onBest && <button className="btn-ghost" style={{ padding: "0.25rem 0.55rem", fontSize: "0.75rem" }} onClick={onBest}>Best answer</button>}
      </div>
      {!!post.children?.length && (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {post.children.map((c) => (
            <PostBlock key={c.id} post={c} onReply={onReply} onReact={onReact} />
          ))}
        </div>
      )}
    </article>
  );
}
