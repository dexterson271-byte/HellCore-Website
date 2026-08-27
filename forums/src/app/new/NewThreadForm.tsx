"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Category = { id: number; name: string; slug: string };

export default function NewThreadForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [categoryId, setCategoryId] = useState(params.get("category") || "");
  const [pollQ, setPollQ] = useState("");
  const [pollOpts, setPollOpts] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/categories")
      .then((r) => r.json())
      .then((d) => {
        const cats = (d.groups || []).flatMap((g: { categories: Category[] }) => g.categories);
        setCategories(cats);
        if (!categoryId && cats[0]) setCategoryId(String(cats[0].id));
      })
      .catch(() => setError("Failed to load categories"));
  }, [categoryId]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const options = pollOpts.split("\n").map((s) => s.trim()).filter(Boolean);
      const res = await fetch("/api/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          content,
          categoryId: Number(categoryId),
          poll: pollQ && options.length >= 2 ? { question: pollQ, options } : undefined,
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

  return (
    <form onSubmit={onSubmit} className="card" style={{ padding: "1.2rem", display: "grid", gap: 12, maxWidth: 760, margin: "0 auto" }}>
      <h1 style={{ margin: 0 }}>Create Discussion</h1>
      {error && <div style={{ color: "var(--bad)" }}>{error}</div>}
      <label className="muted">Category
        <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </label>
      <label className="muted">Title
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} minLength={4} required />
      </label>
      <label className="muted">Content (Markdown)
        <textarea className="input" rows={10} value={content} onChange={(e) => setContent(e.target.value)} minLength={4} required />
      </label>
      <details>
        <summary className="muted">Optional poll</summary>
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          <input className="input" placeholder="Poll question" value={pollQ} onChange={(e) => setPollQ(e.target.value)} />
          <textarea className="input" rows={4} placeholder={"Option A\nOption B"} value={pollOpts} onChange={(e) => setPollOpts(e.target.value)} />
        </div>
      </details>
      <button className="btn" disabled={loading}>{loading ? "Posting…" : "Publish thread"}</button>
    </form>
  );
}
