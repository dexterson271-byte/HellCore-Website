import Link from "next/link";
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
  return (
    <header className="nav-shell">
      <div className="container" style={{ display: "flex", alignItems: "center", gap: 16, minHeight: 64 }}>
        <Link href="/" style={{ fontWeight: 900, letterSpacing: "-0.03em", fontSize: "1.15rem" }}>
          HELLCORE <span style={{ color: "var(--accent)" }}>Forums</span>
        </Link>
        <nav className="desktop-nav" style={{ display: "flex", gap: 6, flex: 1, flexWrap: "wrap" }}>
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="btn-ghost" style={{ padding: "0.4rem 0.7rem", fontSize: "0.85rem" }}>
              {l.label}
            </Link>
          ))}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Link href="/search" className="btn-ghost" style={{ padding: "0.45rem 0.7rem" }}>Search</Link>
          {user ? (
            <>
              <Link href="/notifications" className="btn-ghost" style={{ padding: "0.45rem 0.7rem", position: "relative" }}>
                Alerts{unread > 0 ? ` (${unread})` : ""}
              </Link>
              <Link href="/messages" className="btn-ghost" style={{ padding: "0.45rem 0.7rem" }}>Messages</Link>
              <Link href={`/u/${user.username}`} className="btn-ghost" style={{ padding: "0.45rem 0.7rem" }}>
                {user.username}
              </Link>
              <Link href="/new" className="btn">Create Thread</Link>
              {["mod", "admin", "dev", "owner", "founder"].includes(user.role) && (
                <Link href="/admin" className="btn-ghost">Admin</Link>
              )}
            </>
          ) : (
            <a className="btn" href={`${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`}>
              Login
            </a>
          )}
        </div>
      </div>
    </header>
  );
}
