import { prisma } from "@/lib/db";
import { handleApiError, json } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const sort = searchParams.get("sort") || "reputation";
    const take = Math.min(50, Number(searchParams.get("limit") || 24));
    const where = q
      ? {
          OR: [
            { username: { contains: q, mode: "insensitive" as const } },
            { mcUsername: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {};
    const orderBy =
      sort === "posts"
        ? { postCount: "desc" as const }
        : sort === "xp"
          ? { xp: "desc" as const }
          : sort === "new"
            ? { createdAt: "desc" as const }
            : { reputation: "desc" as const };

    const members = await prisma.forumUser.findMany({
      where,
      orderBy,
      take,
      select: {
        id: true,
        username: true,
        mcUsername: true,
        role: true,
        level: true,
        reputation: true,
        xp: true,
        postCount: true,
        threadCount: true,
        avatarUrl: true,
        lastActiveAt: true,
      },
    });
    return json({ members });
  } catch (e) {
    return handleApiError(e);
  }
}
