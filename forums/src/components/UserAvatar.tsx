import Link from "next/link";
import { avatarUrl } from "@/lib/avatars";
import { roleColor } from "@/lib/roles";

export function UserAvatar({
  username,
  mcUsername,
  avatarUrl: customUrl,
  size = 32,
  className = "",
}: {
  username: string;
  mcUsername?: string | null;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}) {
  const src = customUrl || avatarUrl(username, mcUsername, size);
  return (
    <img
      className={`user-avatar-sm ${className}`.trim()}
      src={src}
      alt={username}
      width={size}
      height={size}
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

export function Username({
  username,
  role = "member",
  className = "",
}: {
  username: string;
  role?: string;
  className?: string;
}) {
  return (
    <Link
      href={`/u/${username}`}
      className={`username ${className}`.trim()}
      style={{ color: roleColor(role), fontWeight: 700 }}
    >
      {username}
    </Link>
  );
}
