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
  threadCount: number;
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
  stats: { members: number; online: number; threads: number; posts: number };
}) {
  return (
    <aside className="forum-sidebar">
      <div className="sidebar-card">
        <div className="sidebar-card-header">Your Profile</div>
        <div className="sidebar-card-body">
          {user && userProfile ? (
            <>
              <div className="user-card">
                <img
                  className="user-avatar"
                  src={userProfile.avatarUrl || avatarUrl(userProfile.username, userProfile.mcUsername, 48)}
                  alt={userProfile.username}
                />
                <div>
                  <Username username={userProfile.username} role={userProfile.role} />
                  <div className="user-rank">{roleLabel(userProfile.role)}</div>
                </div>
              </div>
              <div className="user-stats">
                <span>
                  <strong>{userProfile.postCount}</strong> messages
                </span>
                <span>
                  <strong>{userProfile.reputation}</strong> reputation
                </span>
                <span>
                  L<strong>{userProfile.level}</strong>
                </span>
              </div>
            </>
          ) : (
            <div>
              <p className="muted" style={{ margin: "0 0 10px", fontSize: "0.82rem", lineHeight: 1.5 }}>
                Sign in with your Hellcore account to post, react, and message.
              </p>
              <a className="btn btn-sm" href={`${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`}>
                Login
              </a>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-card">
        <div className="sidebar-card-header">
          Online Now
          <span className="online-dot" /> {stats.online}
        </div>
        <div className="sidebar-card-body">
          {onlineUsers.length ? (
            <>
              <div className="online-avatars">
                {onlineUsers.slice(0, 14).map((u) => (
                  <Link key={u.id} href={`/u/${u.username}`} title={u.username} className="online-avatar-link">
                    <UserAvatar
                      username={u.username}
                      mcUsername={u.mcUsername}
                      avatarUrl={u.avatarUrl}
                      size={32}
                    />
                  </Link>
                ))}
              </div>
              <div className="online-list" style={{ marginTop: 10 }}>
                {onlineUsers.map((u, i) => (
                  <span key={u.id}>
                    {i > 0 && <span className="sep">, </span>}
                    <Username username={u.username} role={u.role} />
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              No members online right now.
            </p>
          )}
        </div>
      </div>

      {latestPosts.length > 0 && (
        <div className="sidebar-card">
          <div className="sidebar-card-header">Latest Posts</div>
          <div className="sidebar-card-body" style={{ padding: 0 }}>
            {latestPosts.map((t) => (
              <Link key={t.id} href={`/t/${t.id}/${t.slug}`} className="latest-post-item">
                <UserAvatar
                  username={t.author.username}
                  mcUsername={t.author.mcUsername}
                  avatarUrl={t.author.avatarUrl}
                  size={36}
                />
                <div className="latest-post-item-text">
                  <div className="latest-post-item-title">{t.title}</div>
                  <div className="latest-post-item-meta">
                    By <Username username={t.author.username} role={t.author.role} />
                    {" · "}
                    {formatDistanceToNow(new Date(t.lastActivityAt), { addSuffix: true })}
                  </div>
                  <div className="latest-post-item-forum" style={{ color: t.category.color }}>
                    {t.category.name}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="sidebar-card">
        <div className="sidebar-card-header">Forum Statistics</div>
        <div className="sidebar-card-body" style={{ fontSize: "0.8rem", lineHeight: 1.7 }}>
          <div>
            <span className="muted">Members:</span> <strong>{stats.members.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted">Online:</span> <strong style={{ color: "var(--good)" }}>{stats.online}</strong>
          </div>
          <div>
            <span className="muted">Threads:</span> <strong>{stats.threads.toLocaleString()}</strong>
          </div>
          <div>
            <span className="muted">Posts:</span> <strong>{stats.posts.toLocaleString()}</strong>
          </div>
        </div>
      </div>
    </aside>
  );
}
