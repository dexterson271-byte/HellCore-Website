import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { renderMarkdown } from "@/lib/markdown";
import { awardXp, notify, trackEvent } from "@/lib/notify";
import { publishThreadEvent } from "@/lib/pusher";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const threadId = Number(id);
    const rl = await rateLimit(`reply:${session.forumUserId}`, 20, 60_000);
    if (!rl.ok) return json({ error: "Slow down" }, 429);

    const thread = await prisma.thread.findFirst({ where: { id: threadId, deletedAt: null } });
    if (!thread) return json({ error: "Thread not found" }, 404);
    if (thread.isLocked) throw new AuthError("Thread is locked", 403);

    const mute = await prisma.mute.findFirst({
      where: {
        userId: session.forumUserId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (mute) throw new AuthError("You are muted", 403);

    const body = await req.json();
    const content = String(body.content || "").trim();
    if (content.length < 1) return json({ error: "Content required" }, 400);
    const parentId = body.parentId ? Number(body.parentId) : null;
    let depth = 0;
    if (parentId) {
      const parent = await prisma.post.findFirst({ where: { id: parentId, threadId } });
      if (!parent) return json({ error: "Parent not found" }, 404);
      depth = Math.min(6, parent.depth + 1);
    }

    const html = await renderMarkdown(content);
    const post = await prisma.$transaction(async (tx) => {
      const p = await tx.post.create({
        data: {
          threadId,
          authorId: session.forumUserId,
          parentId,
          body: content,
          bodyHtml: html,
          depth,
        },
        include: {
          author: { select: { id: true, username: true, role: true, level: true, avatarUrl: true } },
        },
      });
      await tx.thread.update({
        where: { id: threadId },
        data: {
          replyCount: { increment: 1 },
          lastActivityAt: new Date(),
          searchText: `${thread.title}\n${thread.searchText || ""}\n${content}`.slice(0, 20000),
        },
      });
      await tx.category.update({
        where: { id: thread.categoryId },
        data: { postCount: { increment: 1 } },
      });
      await tx.forumUser.update({
        where: { id: session.forumUserId },
        data: { postCount: { increment: 1 } },
      });
      return p;
    });

    await awardXp(session.forumUserId, 10, "Posted a reply");
    await trackEvent("reply_create", session.forumUserId, { threadId, postId: post.id });

    if (thread.authorId !== session.forumUserId) {
      await notify({
        userId: thread.authorId,
        actorId: session.forumUserId,
        type: "REPLY",
        title: `${session.username} replied to your thread`,
        body: thread.title,
        href: `/t/${threadId}/${thread.slug}`,
      });
    }

    const followers = await prisma.threadFollow.findMany({ where: { threadId } });
    for (const f of followers) {
      if (f.userId === session.forumUserId) continue;
      await notify({
        userId: f.userId,
        actorId: session.forumUserId,
        type: "REPLY",
        title: `New reply in ${thread.title}`,
        href: `/t/${threadId}/${thread.slug}`,
      });
    }

    await publishThreadEvent(threadId, "new-reply", { post });

    const first = await prisma.achievement.findUnique({ where: { key: "first_post" } });
    if (first) {
      await prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId: session.forumUserId, achievementId: first.id } },
        create: { userId: session.forumUserId, achievementId: first.id },
        update: {},
      });
    }

    return json({ post }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
