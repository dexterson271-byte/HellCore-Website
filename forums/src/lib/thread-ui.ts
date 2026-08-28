import { roleColor, roleLabel } from "./roles";

export const THREAD_REACTIONS = [
  { type: "LIKE", label: "Like" },
  { type: "LOVE", label: "Love" },
  { type: "FIRE", label: "Fire" },
  { type: "FUNNY", label: "Funny" },
  { type: "WOW", label: "Wow" },
  { type: "DISLIKE", label: "Dislike" },
] as const;

export type ThreadAuthor = {
  id: number;
  username: string;
  role: string;
  level: number;
  avatarUrl?: string | null;
  mcUsername?: string | null;
  reputation?: number;
  postCount?: number;
  createdAt?: string;
};

export type ThreadPost = {
  id: number;
  parentId?: number | null;
  body: string;
  bodyHtml?: string | null;
  isBestAnswer?: boolean;
  depth: number;
  createdAt: string;
  author: ThreadAuthor;
  reactions: { type: string; userId: number }[];
  children?: ThreadPost[];
  quoteFrom?: ThreadPost;
};

export function formatPostDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (d.toDateString() === now.toDateString()) return `Today at ${time}`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return `Yesterday at ${time}`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatJoinDate(iso?: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function isStaffRole(role: string) {
  return ["admin", "mod", "helper", "founder", "owner", "dev"].includes(role.toLowerCase());
}

export function avatarFrameClass(role: string) {
  const r = role.toLowerCase();
  if (isStaffRole(r)) return "post-avatar-frame staff";
  if (r === "vip") return "post-avatar-frame vip";
  return "post-avatar-frame member";
}

export function flattenThreadPosts(posts: ThreadPost[]): ThreadPost[] {
  const byId = new Map<number, ThreadPost>();
  const collect = (list: ThreadPost[]) => {
    for (const p of list) {
      byId.set(p.id, p);
      if (p.children?.length) collect(p.children);
    }
  };
  collect(posts);

  const flat: ThreadPost[] = [];
  const walk = (list: ThreadPost[]) => {
    for (const p of list) {
      flat.push({
        ...p,
        quoteFrom: p.parentId ? byId.get(p.parentId) : undefined,
      });
      if (p.children?.length) walk(p.children);
    }
  };
  walk(posts);
  return flat;
}

export function staffBadgeLabel(role: string) {
  const r = role.toLowerCase();
  if (r === "admin" || r === "founder" || r === "owner") return "Hellcore Staff";
  if (r === "mod") return "Moderator";
  if (r === "helper") return "Helper";
  if (r === "dev") return "Developer";
  return "";
}

export { roleColor, roleLabel };
