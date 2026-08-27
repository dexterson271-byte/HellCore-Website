import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { awardXp, notify } from "@/lib/notify";
import { ReactionType } from "@prisma/client";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const postId = Number(id);
    const rl = await rateLimit(`react:${session.forumUserId}`, 60, 60_000);
    if (!rl.ok) return json({ error: "Slow down" }, 429);

    const body = await req.json();
    const type = String(body.type || "LIKE").toUpperCase() as ReactionType;
    if (!Object.values(ReactionType).includes(type)) return json({ error: "Invalid reaction" }, 400);

    const post = await prisma.post.findUnique({ where: { id: postId } });
    if (!post) return json({ error: "Post not found" }, 404);

    const existing = await prisma.reaction.findUnique({
      where: { postId_userId_type: { postId, userId: session.forumUserId, type } },
    });
    if (existing) {
      await prisma.reaction.delete({ where: { id: existing.id } });
      return json({ removed: true });
    }

    const reaction = await prisma.reaction.create({
      data: { postId, userId: session.forumUserId, type },
    });
    if (post.authorId !== session.forumUserId) {
      await awardXp(post.authorId, 2);
      await notify({
        userId: post.authorId,
        actorId: session.forumUserId,
        type: "REACTION",
        title: `${session.username} reacted ${type.toLowerCase()}`,
        href: `/t/${post.threadId}`,
      });
    }
    return json({ reaction }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
