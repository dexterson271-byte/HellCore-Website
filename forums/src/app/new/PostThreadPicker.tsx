"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

type Category = {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  threadCount: number;
};

type Group = {
  id: number;
  name: string;
  slug: string;
  categories: Category[];
};

const GROUP_BLURBS: Record<string, string> = {
  categories: "Official news, server discussion, and suggestions for Hellcore.",
  community: "Meet players, share media, recruit clans, and chat with the community.",
  support: "Get help, report bugs, and submit appeals to staff.",
};

function formatCount(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

export default function PostThreadPicker() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => setGroups(d.groups || []))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="post-picker-backdrop">
      <div className="post-picker-modal" role="dialog" aria-label="Post thread in">
        <div className="post-picker-header">
          <h1>Post thread in...</h1>
          <button type="button" className="post-picker-close" onClick={() => router.back()} aria-label="Close">
            ×
          </button>
        </div>

        <div className="post-picker-body">
          {loading && <p className="muted">Loading categories…</p>}

          {!loading && groups.map((group) => (
            <section key={group.id} className="post-picker-group">
              <h2>{group.name}</h2>
              <p className="post-picker-group-desc">{GROUP_BLURBS[group.slug] || ""}</p>

              <div className="post-picker-table-head">
                <span />
                <span>Threads</span>
              </div>

              {group.categories.map((cat) => (
                <Link
                  key={cat.id}
                  href={`/new?category=${cat.id}`}
                  className="post-picker-row"
                >
                  <div>
                    <strong>{cat.name}</strong>
                    {cat.description && <p>{cat.description}</p>}
                  </div>
                  <span className="post-picker-count">{formatCount(cat.threadCount)}</span>
                </Link>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
