import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: Request, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const pollId = Number(id);
    const body = await req.json();
    const optionId = Number(body.optionId);
    const poll = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    if (!poll) return json({ error: "Poll not found" }, 404);
    if (poll.endsAt && poll.endsAt < new Date()) return json({ error: "Poll ended" }, 400);
    const option = poll.options.find((o) => o.id === optionId);
    if (!option) return json({ error: "Invalid option" }, 400);

    if (!poll.multiple) {
      const existing = await prisma.pollVote.findMany({
        where: { userId: session.forumUserId, option: { pollId } },
      });
      for (const v of existing) {
        await prisma.pollVote.delete({ where: { id: v.id } });
        await prisma.pollOption.update({ where: { id: v.optionId }, data: { votes: { decrement: 1 } } });
      }
    }

    await prisma.pollVote.create({ data: { optionId, userId: session.forumUserId } });
    await prisma.pollOption.update({ where: { id: optionId }, data: { votes: { increment: 1 } } });
    const refreshed = await prisma.poll.findUnique({
      where: { id: pollId },
      include: { options: true },
    });
    return json({ poll: refreshed });
  } catch (e) {
    return handleApiError(e);
  }
}
