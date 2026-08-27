import { cookies } from "next/headers";
import { prisma } from "./db";
import { HellcoreUser, SessionUser, isStaff, levelFromXp } from "./types";

const MAIN_SITE = process.env.MAIN_SITE_URL || "https://www.hellcore.net";
const COOKIE = process.env.HC_AUTH_COOKIE || "hc_token";

export async function fetchHellcoreUser(token: string): Promise<HellcoreUser | null> {
  if (!token) return null;
  try {
    const res = await fetch(`${MAIN_SITE}/api/auth/me`, {
      headers: {
        Cookie: `${COOKIE}=${token}`,
        "X-Auth-Token": token,
      },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as HellcoreUser;
  } catch {
    return null;
  }
}

export async function syncForumUser(hc: HellcoreUser) {
  const role = (hc.role || "member").toLowerCase();
  const xp = Number(hc.current_xp || 0);
  return prisma.forumUser.upsert({
    where: { hellcoreId: hc.id },
    create: {
      hellcoreId: hc.id,
      username: hc.username,
      email: hc.email || null,
      mcUsername: hc.mc_username || null,
      role,
      xp,
      level: levelFromXp(xp),
      lastActiveAt: new Date(),
    },
    update: {
      username: hc.username,
      email: hc.email || null,
      mcUsername: hc.mc_username || null,
      role,
      xp,
      level: levelFromXp(xp),
      lastActiveAt: new Date(),
    },
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value || "";
  const hc = await fetchHellcoreUser(token);
  if (!hc?.id || !hc.username) return null;
  const user = await syncForumUser(hc);
  return {
    hellcoreId: user.hellcoreId,
    username: user.username,
    email: user.email,
    mcUsername: user.mcUsername,
    role: user.role,
    forumUserId: user.id,
    reputation: user.reputation,
    xp: user.xp,
    level: user.level,
    avatarUrl: user.avatarUrl,
  };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) throw new AuthError("Login required");
  return session;
}

export async function requireStaff() {
  const session = await requireSession();
  if (!isStaff(session.role)) throw new AuthError("Staff only", 403);
  return session;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}
