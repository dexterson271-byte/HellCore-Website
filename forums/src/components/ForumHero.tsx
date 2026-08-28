import Link from "next/link";
import { avatarUrl } from "@/lib/avatars";
import { SessionUser } from "@/lib/types";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const LOGO = `${MAIN}/static/logo.png`;

export function ForumHero({
  user,
  unread = 0,
}: {
  user: SessionUser | null;
  unread?: number;
}) {
  const loginUrl = `${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`;

  return (
    <div className="hc-hero-wrap">
      <section className="hc-hero">
        <div className="container">
          <div className="hc-hero-top">
            <div className="hc-user-bar" style={{ marginLeft: "auto" }}>
              {user ? (
                <>
                  <Link href={`/u/${user.username}`}>
                    <img
                      className="user-avatar-sm"
                      src={user.avatarUrl || avatarUrl(user.username, user.mcUsername, 32)}
                      alt=""
                      width={32}
                      height={32}
                    />
                    <span className="hc-username-text">{user.username}</span>
                  </Link>
                  <Link href="/messages" className="hc-icon-btn" title="Messages">
                    ✉
                  </Link>
                  <Link href="/notifications" className="hc-icon-btn" title="Notifications">
                    🔔
                    {unread > 0 && <span className="hc-badge">{unread > 9 ? "9+" : unread}</span>}
                  </Link>
                </>
              ) : (
                <a href={loginUrl} className="hc-icon-btn" title="Login">
                  👤
                </a>
              )}
            </div>
          </div>
          <div className="hc-hero-main">
            <Link href="/" className="hc-logo-link">
              <img className="hc-logo-img" src={LOGO} alt="Hellcore" />
              <span className="hc-logo-text">Hellcore</span>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
