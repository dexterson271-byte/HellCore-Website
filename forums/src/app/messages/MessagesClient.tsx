"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Conversation = {
  id: number;
  subject?: string | null;
  updatedAt: string;
  participants: { user: { id: number; username: string } }[];
  messages: { body: string; createdAt: string }[];
};

export default function MessagesClient() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [to, setTo] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const res = await fetch("/api/messages");
    const data = await res.json();
    if (res.ok) setItems(data.conversations || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function send(e: FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ to, body }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Failed");
      return;
    }
    setTo("");
    setBody("");
    load();
  }

  return (
    <div className="container" style={{ display: "grid", gap: 16, gridTemplateColumns: "minmax(0,1fr) minmax(280px,0.8fr)" }}>
      <section style={{ display: "grid", gap: 10 }}>
        <h1 style={{ margin: 0 }}>Messages</h1>
        {items.map((c) => {
          const others = c.participants.map((p) => p.user.username).join(", ");
          return (
            <Link key={c.id} href={`/messages/${c.id}`} className="card" style={{ padding: "0.9rem" }}>
              <div style={{ fontWeight: 700 }}>{c.subject || others}</div>
              <div className="muted" style={{ fontSize: "0.85rem" }}>{c.messages[0]?.body?.slice(0, 120) || "No messages"}</div>
            </Link>
          );
        })}
        {!items.length && <div className="muted">No conversations yet.</div>}
      </section>
      <form onSubmit={send} className="card" style={{ padding: "1rem", display: "grid", gap: 10, alignContent: "start" }}>
        <h2 style={{ margin: 0, fontSize: "1rem" }}>New message</h2>
        {error && <div style={{ color: "var(--bad)" }}>{error}</div>}
        <input className="input" placeholder="Username" value={to} onChange={(e) => setTo(e.target.value)} required />
        <textarea className="input" rows={5} placeholder="Message" value={body} onChange={(e) => setBody(e.target.value)} required />
        <button className="btn" type="submit">Send</button>
      </form>
    </div>
  );
}
