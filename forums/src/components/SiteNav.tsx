"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { avatarUrl } from "@/lib/avatars";
import { SessionUser } from "@/lib/types";

const STORE = "https://store.hellcore.net";
const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const LOGIN = `${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`;

const links = [
  { href: "/", label: "Forums" },
  { href: "/discover", label: "What's New" },
  { href: "/members", label: "Members" },
  { href: STORE, label: "Store", external: true },
  { href: `${MAIN}/#rules`, label: "Rules", external: true },
];

export function SiteNav({ user }: { user: SessionUser | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const [q, setQ] = useState("");

  function onSearch(e: FormEvent) {
    e.preventDefault();
    const term = q.trim();
    router.push(term ? `/search?q=${encodeURIComponent(term)}` : "/search");
  }

  return (
    <nav className="main-nav">
      <div className="nav-inner">
        <div className="nav-left">
          {links.map((l) => {
            const active = !l.external && (l.href === "/" ? pathname === "/" : pathname.startsWith(l.href));
            const cls = `nav-item${active ? " active" : ""}`;
            if (l.external) {
              return (
                <a key={l.href} href={l.href} className={cls} target="_blank" rel="noreferrer">
                  {l.label}
                </a>
              );
            }
            return (
              <Link key={l.href} href={l.href} className={cls}>
                {l.label}
              </Link>
            );
          })}
        </div>
        <div className="nav-right">
          <form onSubmit={onSearch} style={{ display: "contents" }}>
            <input
              className="search"
              type="text"
              placeholder="Search forums..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Search forums"
            />
          </form>
          {user ? (
            <Link href={`/u/${user.username}`} className="user">
              <img
                src={user.avatarUrl || avatarUrl(user.username, user.mcUsername, 32)}
                alt={user.username}
              />
              <span>{user.username}</span>
            </Link>
          ) : (
            <a href={LOGIN} className="user">
              <span>Log in</span>
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
