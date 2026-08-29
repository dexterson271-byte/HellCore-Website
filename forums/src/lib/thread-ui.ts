import { roleColor, roleLabel } from "./roles";

/** Sprite sheet: /reactions.png — 16×16 icons stacked vertically (15 frames). */
export const THREAD_REACTIONS = [
  { type: "DIAMOND", label: "Diamond", sprite: 0 },
  { type: "AGREE", label: "Agree", sprite: 1 },
  { type: "BUG", label: "Bug", sprite: 2 },
  { type: "FISH", label: "Fish", sprite: 3 },
  { type: "DISLIKE", label: "Disagree", sprite: 4 },
  { type: "USEFUL", label: "Useful", sprite: 5 },
  { type: "FUNNY", label: "Funny", sprite: 6 },
  { type: "HYPE", label: "Hype", sprite: 7 },
  { type: "COIN", label: "Coin", sprite: 8 },
  { type: "LOVE", label: "Emerald", sprite: 9 },
  { type: "LIKE", label: "Like", sprite: 10 },
  { type: "CREATIVE", label: "Creative", sprite: 11 },
  { type: "THINK", label: "Think", sprite: 12 },
  { type: "FIRE", label: "Ruby", sprite: 13 },
  { type: "WOW", label: "Wow", sprite: 14 },
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

export function avatarRankClass(role: string) {
  const r = role.toLowerCase();
  if (isStaffRole(r)) return "message-avatar-rank-STAFF";
  if (r === "vip") return "message-avatar-rank-VIP";
  return "message-avatar-rank";
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
