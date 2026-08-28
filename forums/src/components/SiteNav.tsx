"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { SessionUser } from "@/lib/types";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";

const links = [
  { href: "/", label: "Home" },
  { href: "/discover", label: "Discover" },
  { href: "/forums", label: "Forums" },
  { href: "/categories", label: "Categories" },
  { href: "/members", label: "Members" },
  { href: "/leaderboards", label: "Leaderboards" },
];

export function SiteNav({
  user,
  unread = 0,
}: {
  user: SessionUser | null;
  unread?: number;
}) {
  const pathname = usePathname();

  return (
    <>
      <div className="util-bar">
        <div className="container" style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, minHeight: 32, padding: "4px 0" }}>
          {user ? (
            <>
              <Link href={`/u/${user.username}`}>Profile</Link>
              <Link href="/messages">Messages</Link>
              <Link href="/notifications">
                Alerts{unread > 0 ? ` (${unread})` : ""}
              </Link>
              {["mod", "admin", "dev", "owner", "founder"].includes(user.role) && (
                <Link href="/admin">Admin</Link>
              )}
            </>
          ) : (
            <a href={`${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`}>Login</a>
          )}
        </div>
      </div>

      <header className="nav-shell">
        <div className="container">
          <nav className="nav-tabs desktop-nav">
            {links.map((l) => {
              const active = l.href === "/" ? pathname === "/" : pathname.startsWith(l.href);
              return (
                <Link key={l.href} href={l.href} className={`nav-tab${active ? " active" : ""}`}>
                  {l.label}
                </Link>
              );
            })}
            <Link href="/search" className="nav-tab" style={{ marginLeft: "auto" }}>
              🔍 Search
            </Link>
          </nav>
        </div>
      </header>
    </>
  );
}
