export const STAFF_ROLES = new Set(["helper", "mod", "admin", "dev", "owner", "founder"]);
export const ADMIN_ROLES = new Set(["admin", "dev", "owner", "founder"]);
export const MOD_ROLES = new Set(["mod", "admin", "dev", "owner", "founder"]);

export type HellcoreUser = {
  id: number;
  username: string;
  email?: string;
  mc_username?: string;
  role?: string;
  current_xp?: number;
  is_verified?: boolean;
};

export type SessionUser = {
  hellcoreId: number;
  username: string;
  email?: string | null;
  mcUsername?: string | null;
  role: string;
  forumUserId: number;
  reputation: number;
  xp: number;
  level: number;
  avatarUrl?: string | null;
};

export function isStaff(role?: string | null) {
  return !!role && STAFF_ROLES.has(role.toLowerCase());
}

export function isAdmin(role?: string | null) {
  return !!role && ADMIN_ROLES.has(role.toLowerCase());
}

export function isMod(role?: string | null) {
  return !!role && MOD_ROLES.has(role.toLowerCase());
}

export function slugify(input: string) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "thread";
}

export function levelFromXp(xp: number) {
  return Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 50)) + 1);
}
