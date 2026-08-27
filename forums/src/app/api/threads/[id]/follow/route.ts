import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(_req: Request, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const threadId = Number(id);
    const existing = await prisma.threadFollow.findUnique({
      where: { userId_threadId: { userId: session.forumUserId, threadId } },
    });
    if (existing) {
      await prisma.threadFollow.delete({ where: { id: existing.id } });
      return json({ following: false });
    }
    await prisma.threadFollow.create({ data: { userId: session.forumUserId, threadId } });
    return json({ following: true });
  } catch (e) {
    return handleApiError(e);
  }
}
