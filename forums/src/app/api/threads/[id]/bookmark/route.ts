import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const threadId = Number(id);
    const existing = await prisma.bookmark.findUnique({
      where: { userId_threadId: { userId: session.forumUserId, threadId } },
    });
    if (existing) {
      await prisma.bookmark.delete({ where: { id: existing.id } });
      return json({ bookmarked: false });
    }
    await prisma.bookmark.create({ data: { userId: session.forumUserId, threadId } });
    return json({ bookmarked: true });
  } catch (e) {
    return handleApiError(e);
  }
}
