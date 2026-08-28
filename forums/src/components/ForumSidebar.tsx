import Link from "next/link";
import { avatarUrl } from "@/lib/avatars";
import { roleLabel } from "@/lib/forum-data";
import { SessionUser } from "@/lib/types";

type OnlineUser = { id: number; username: string; mcUsername?: string | null; role: string };
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

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";

export function ForumSidebar({
  user,
  userProfile,
  onlineUsers,
  stats,
}: {
  user: SessionUser | null;
  userProfile: UserProfile | null;
  onlineUsers: OnlineUser[];
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
                  src={userProfile.avatarUrl || avatarUrl(userProfile.username, userProfile.mcUsername)}
                  alt=""
                />
                <div>
                  <Link href={`/u/${userProfile.username}`} style={{ fontWeight: 800, fontSize: "0.95rem" }}>
                    {userProfile.username}
                  </Link>
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

      <div className="sidebar-card">
        <div className="sidebar-card-header">
          Members Online ({onlineUsers.length})
        </div>
        <div className="sidebar-card-body">
          {onlineUsers.length ? (
            <div className="online-list">
              {onlineUsers.map((u, i) => (
                <span key={u.id}>
                  {i > 0 && <span className="sep">, </span>}
                  <Link href={`/u/${u.username}`}>{u.username}</Link>
                </span>
              ))}
            </div>
          ) : (
            <p className="muted" style={{ margin: 0, fontSize: "0.82rem" }}>
              No members online right now.
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
