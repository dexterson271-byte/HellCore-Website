import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";

export async function GET() {
  try {
    const [byReputation, byPosts, byXp] = await Promise.all([
      prisma.forumUser.findMany({
        orderBy: { reputation: "desc" },
        take: 20,
        select: { id: true, username: true, avatarUrl: true, level: true, reputation: true, postCount: true, xp: true, role: true },
      }),
      prisma.forumUser.findMany({
        orderBy: { postCount: "desc" },
        take: 20,
        select: { id: true, username: true, avatarUrl: true, level: true, reputation: true, postCount: true, xp: true, role: true },
      }),
      prisma.forumUser.findMany({
        orderBy: { xp: "desc" },
        take: 20,
        select: { id: true, username: true, avatarUrl: true, level: true, reputation: true, postCount: true, xp: true, role: true },
      }),
    ]);
    return json({ byReputation, byPosts, byXp });
  } catch (e) {
    return handleApiError(e);
  }
}
