import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { avatarUrl } from "@/lib/avatars";
import { roleLabel } from "@/lib/roles";
import { UserAvatar, Username } from "@/components/UserAvatar";
import { SessionUser } from "@/lib/types";

type OnlineUser = {
  id: number;
  username: string;
  mcUsername?: string | null;
  role: string;
  avatarUrl?: string | null;
};
type UserProfile = {
  username: string;
  mcUsername?: string | null;
  role: string;
  reputation: number;
  postCount: number;
  level: number;
  avatarUrl?: string | null;
};
type LatestPost = {
  id: number;
  title: string;
  slug: string;
  lastActivityAt: Date;
  author: {
    username: string;
    mcUsername?: string | null;
    role: string;
    avatarUrl?: string | null;
  };
  category: { name: string; slug: string; color: string };
};

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";

export function ForumSidebar({
  user,
  userProfile,
  onlineUsers,
  latestPosts = [],
  stats,
}: {
  user: SessionUser | null;
  userProfile: UserProfile | null;
  onlineUsers: OnlineUser[];
  latestPosts?: LatestPost[];
  stats: { members: number; online: number };
}) {
  const guestEstimate = Math.max(0, Math.floor(stats.members * 0.6));

  return (
    <aside className="sidebar">
      <section className="side-card">
        <h3 className="side-card-title">YOUR PROFILE</h3>
        {user && userProfile ? (
          <>
            <div className="profile">
              <img
                src={userProfile.avatarUrl || avatarUrl(userProfile.username, userProfile.mcUsername, 44)}
                alt={userProfile.username}
              />
              <div>
                <strong>{userProfile.username}</strong>
                <small>{roleLabel(userProfile.role)}</small>
              </div>
            </div>
            <div className="profile-stats">
              {userProfile.postCount} messages &nbsp; {userProfile.reputation} reputation &nbsp; L{userProfile.level}
            </div>
          </>
        ) : (
          <div className="profile">
            <p style={{ margin: 0, fontSize: 13, color: "#888", lineHeight: 1.5 }}>
              Sign in with your Hellcore account to post and react.
            </p>
            <a href={`${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`} className="btn primary btn-sm" style={{ marginTop: 10, display: "inline-block" }}>
              Log In
            </a>
          </div>
        )}
      </section>

      <section className="side-card">
        <h3 className="side-card-title">
          PLAYERS ONLINE
          <span className="online-dot" />
        </h3>
        <div className="online-number">{stats.online.toLocaleString()}</div>
        {onlineUsers.length > 0 && (
          <div className="avatars">
            {onlineUsers.slice(0, 16).map((u) => (
              <Link key={u.id} href={`/u/${u.username}`} title={u.username}>
                <img
                  src={u.avatarUrl || avatarUrl(u.username, u.mcUsername, 38)}
                  alt={u.username}
                />
              </Link>
            ))}
          </div>
        )}
        <span className="online-text">… and {guestEstimate.toLocaleString()} guests</span>
      </section>

      {latestPosts.length > 0 && (
        <section className="side-card">
          <h3 className="side-card-title">RECENT POSTS</h3>
          <div className="recent-posts-list">
            {latestPosts.slice(0, 6).map((t) => (
              <Link key={t.id} href={`/t/${t.id}/${t.slug}`} className="recent-post-item">
                <UserAvatar
                  username={t.author.username}
                  mcUsername={t.author.mcUsername}
                  avatarUrl={t.author.avatarUrl}
                  size={36}
                />
                <div className="recent-post-text">
                  <div className="recent-post-title">{t.title}</div>
                  <div className="recent-post-meta">
                    By <Username username={t.author.username} role={t.author.role} />
                    {" — "}
                    {formatDistanceToNow(new Date(t.lastActivityAt), { addSuffix: true })}
                  </div>
                  <div className="recent-post-forum">{t.category.name}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </aside>
  );
}
