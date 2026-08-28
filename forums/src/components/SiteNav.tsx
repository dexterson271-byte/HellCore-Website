"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

const STORE = "https://store.hellcore.net";
const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";

const links = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/forums", label: "Forums", icon: "💬" },
  { href: "/discover", label: "What's New", icon: "✨" },
  { href: "/members", label: "Members", icon: "👥" },
  { href: STORE, label: "Store", icon: "🛒", external: true },
  { href: `${MAIN}/#rules`, label: "Rules", icon: "📜", external: true },
  { href: "/categories", label: "More", icon: "⋯" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  }

  return (
    <header className="nav-shell">
      <div className="container nav-inner">
        {links.map((l) => {
          const active = !l.external && (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href));
          const cls = `nav-tab${active ? " active" : ""}`;
          if (l.external) {
            return (
              <a key={l.href} href={l.href} className={cls} target={l.href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">
                <span>{l.icon}</span> {l.label}
              </a>
            );
          }
          return (
            <Link key={l.href} href={l.href} className={cls}>
              <span>{l.icon}</span> {l.label}
            </Link>
          );
        })}
        <form className="nav-search" onSubmit={onSearch}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search forums…"
            aria-label="Search forums"
          />
          <button type="submit">🔍</button>
        </form>
      </div>
    </header>
  );
}
