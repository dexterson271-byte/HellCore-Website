"use client";

import { useMemo, useState } from "react";
import { ThreadCard } from "@/components/ThreadCard";

type Thread = {
  id: number;
  title: string;
  slug: string;
  replyCount: number;
  views: number;
  isPinned?: boolean;
  isLocked?: boolean;
  isSolved?: boolean;
  isFeatured?: boolean;
  lastActivityAt: string;
  author: { username: string; level?: number };
  category?: { name: string; slug: string; color?: string };
};

const TABS = ["trending", "newest", "popular", "unanswered", "staff", "featured"] as const;

export default function DiscoverClient({ initial }: { initial: Record<string, Thread[]> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("trending");
  const [sort, setSort] = useState("activity");
  const list = useMemo(() => {
    const rows = [...(initial[tab] || [])];
    if (sort === "replies") rows.sort((a, b) => b.replyCount - a.replyCount);
    if (sort === "views") rows.sort((a, b) => b.views - a.views);
    if (sort === "new") rows.sort((a, b) => +new Date(b.lastActivityAt) - +new Date(a.lastActivityAt));
    return rows;
  }, [initial, tab, sort]);

  return (
    <div className="container">
      <div className="forum-frame">
        <div className="forum-toolbar">
          <div>
            <h1 style={{ margin: 0, fontSize: "1.1rem", color: "var(--gold-light)" }}>Discover</h1>
            <p className="muted" style={{ margin: "4px 0 0", fontSize: "0.82rem" }}>Trending, popular, unanswered, and staff picks</p>
          </div>
        </div>
        <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--frame-border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {TABS.map((t) => (
            <button key={t} className={tab === t ? "btn btn-sm" : "btn-ghost btn-sm"} onClick={() => setTab(t)} style={{ textTransform: "capitalize" }}>
              {t}
            </button>
          ))}
        </div>
        <div style={{ padding: "0.5rem 1rem", borderBottom: "1px solid var(--frame-border)", display: "flex", gap: 8, flexWrap: "wrap" }}>
          {[
            ["activity", "Most active"],
            ["new", "Latest"],
            ["replies", "Most replies"],
            ["views", "Most viewed"],
          ].map(([k, label]) => (
            <button key={k} className={sort === k ? "btn btn-sm" : "btn-ghost btn-sm"} onClick={() => setSort(k)}>
              {label}
            </button>
          ))}
        </div>
        {list.map((t) => (
          <ThreadCard key={t.id} {...t} showCategory />
        ))}
        {!list.length && (
          <div style={{ padding: "2rem", textAlign: "center" }} className="muted">No discussions found.</div>
        )}
      </div>
    </div>
  );
}
