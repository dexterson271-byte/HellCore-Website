"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Category = {
  id: number;
  name: string;
  slug: string;
  group?: { name: string; slug: string } | null;
};

function wrapSelection(command: string) {
  const el = document.querySelector<HTMLTextAreaElement>("#thread-content");
  if (!el) return;
  const start = el.selectionStart;
  const end = el.selectionEnd;
  const selected = el.value.slice(start, end);
  const wrapped = command === "link" && selected
    ? `[${selected}](url)`
    : `${command}${selected}${command === "**" ? "**" : command === "*" ? "*" : ""}`;
  el.setRangeText(wrapped, start, end, "end");
  el.focus();
}

export default function NewThreadForm() {
  const router = useRouter();
  const params = useSearchParams();
  const categoryParam = params.get("category");

  const [category, setCategory] = useState<Category | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tab, setTab] = useState<"discussion" | "poll">("discussion");
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!categoryParam) return;
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats = (d.groups || []).flatMap((g: { name: string; slug: string; categories: Category[] }) =>
          g.categories.map((c) => ({ ...c, group: { name: g.name, slug: g.slug } })),
        );
        const found = cats.find((c: Category) => String(c.id) === categoryParam);
        setCategory(found || null);
      })
      .catch(() => setError("Failed to load category"));
  }, [categoryParam]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!category) return;
    const options = pollOpts.split("\n").map((s) => s.trim()).filter(Boolean);
    if (tab === "poll" && (!pollQ || options.length < 2)) {
      setError("Poll needs a question and at least 2 options.");
      return;
    }
    if (tab === "discussion" && content.trim().length < 4) {
      setError("Post content must be at least 4 characters.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content: content.trim() || (tab === "poll" ? pollQ : ""),
          categoryId: category.id,
          poll: tab === "poll" && pollQ && options.length >= 2 ? { question: pollQ, options } : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      router.push(`/t/${data.thread.id}/${data.thread.slug}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  if (!categoryParam) return null;

  if (!category && !error) {
    return <div className="post-thread-page"><p className="muted">Loading…</p></div>;
  }

  if (!category) {
    return (
      <div className="post-thread-page">
        <p style={{ color: "var(--bad, #e63a2d)" }}>{error || "Category not found."}</p>
        <Link href="/new" className="btn">Choose category</Link>
      </div>
    );
  }

  return (
    <div className="post-thread-page">
      <nav className="post-thread-crumb">
        <Link href="/">Home</Link>
        <span>›</span>
        <Link href="/forums">Forums</Link>
        <span>›</span>
        <Link href={`/c/${category.slug}`}>{category.name}</Link>
        <span>›</span>
      </nav>

      <h1 className="post-thread-title">Post thread</h1>

      <form onSubmit={onSubmit} className="post-thread-frame">
        {error && <div className="post-thread-error">{error}</div>}

        <input
          className="post-thread-title-input"
          placeholder="Thread title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={4}
          required
        />

        <div className="post-thread-tabs">
          <button
            type="button"
            className={tab === "discussion" ? "active" : ""}
            onClick={() => setTab("discussion")}
          >
            Discussion
          </button>
          <button
            type="button"
            className={tab === "poll" ? "active" : ""}
            onClick={() => setTab("poll")}
          >
            Poll
          </button>
        </div>

        {tab === "discussion" ? (
          <>
            <div className="post-thread-toolbar">
              <button type="button" onClick={() => wrapSelection("**")} title="Bold"><b>B</b></button>
              <button type="button" onClick={() => wrapSelection("*")} title="Italic"><i>I</i></button>
              <button type="button" onClick={() => wrapSelection("link")} title="Link">Link</button>
              <span className="post-thread-toolbar-spacer" />
              <button type="button" onClick={() => setContent((c) => `${c}\n> `)} title="Quote">Quote</button>
            </div>
            <textarea
              id="thread-content"
              className="post-thread-editor"
              rows={14}
              placeholder="Write your post…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </>
        ) : (
          <div className="post-thread-poll">
            <input
              className="input"
              placeholder="Poll question"
              value={pollQ}
              onChange={(e) => setPollQ(e.target.value)}
              required={tab === "poll"}
            />
            <textarea
              className="input"
              rows={6}
              placeholder={"Option A\nOption B\nOption C"}
              value={pollOpts}
              onChange={(e) => setPollOpts(e.target.value)}
              required={tab === "poll"}
            />
            <textarea
              id="thread-content"
              className="post-thread-editor"
              rows={6}
              placeholder="Optional message to go with your poll…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        )}

        <div className="post-thread-actions">
          <Link href="/new" className="btn">Back</Link>
          <button type="submit" className="btn primary" disabled={loading}>
            {loading ? "Posting…" : "Post thread"}
          </button>
        </div>
      </form>
    </div>
  );
}
