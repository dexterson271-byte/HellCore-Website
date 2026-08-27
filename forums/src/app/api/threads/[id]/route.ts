import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, getSession, AuthError } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { isMod, isStaff } from "@/lib/types";
import { trackEvent } from "@/lib/notify";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const threadId = Number(id);
    const session = await getSession();

    const thread = await prisma.thread.findFirst({
      where: { id: threadId, deletedAt: null },
      include: {
        author: true,
        category: true,
        poll: { include: { options: true } },
        bookmarks: session ? { where: { userId: session.forumUserId } } : false,
        follows: session ? { where: { userId: session.forumUserId } } : false,
      },
    });
    if (!thread) return json({ error: "Not found" }, 404);
    if (thread.isStaffOnly && !isStaff(session?.role)) return json({ error: "Staff only" }, 403);

    await prisma.thread.update({ where: { id: threadId }, data: { views: { increment: 1 } } });
    await trackEvent("thread_view", session?.forumUserId, { threadId });

    const posts = await prisma.post.findMany({
      where: { threadId, deletedAt: null },
      orderBy: { createdAt: "asc" },
      include: {
        author: {
          select: {
            id: true,
            username: true,
            role: true,
            level: true,
            reputation: true,
            avatarUrl: true,
            mcUsername: true,
          },
        },
        reactions: true,
        attachments: true,
        children: {
          where: { deletedAt: null },
          include: {
            author: { select: { id: true, username: true, role: true, level: true, avatarUrl: true } },
            reactions: true,
          },
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const rootPosts = posts.filter((p) => !p.parentId);

    return json({
      thread: {
        ...thread,
        bookmarked: Array.isArray(thread.bookmarks) ? thread.bookmarks.length > 0 : false,
        following: Array.isArray(thread.follows) ? thread.follows.length > 0 : false,
      },
      posts: rootPosts,
      allPosts: posts,
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const threadId = Number(id);
    const body = await req.json();
    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) return json({ error: "Not found" }, 404);

    const canMod = isMod(session.role) || thread.authorId === session.forumUserId;
    if (!canMod) throw new AuthError("Forbidden", 403);

    const data: Record<string, unknown> = {};
    if (typeof body.isLocked === "boolean" && isMod(session.role)) data.isLocked = body.isLocked;
    if (typeof body.isPinned === "boolean" && isMod(session.role)) data.isPinned = body.isPinned;
    if (typeof body.isFeatured === "boolean" && isMod(session.role)) data.isFeatured = body.isFeatured;
    if (typeof body.isArchived === "boolean" && isMod(session.role)) data.isArchived = body.isArchived;
    if (typeof body.isSolved === "boolean") data.isSolved = body.isSolved;
    if (body.categoryId && isMod(session.role)) data.categoryId = Number(body.categoryId);
    if (body.title && (isMod(session.role) || thread.authorId === session.forumUserId)) {
      data.title = String(body.title).trim();
    }
    if (body.bestAnswerId) {
      const postId = Number(body.bestAnswerId);
      const post = await prisma.post.findFirst({ where: { id: postId, threadId } });
      if (!post) return json({ error: "Post not found" }, 404);
      data.isSolved = true;
      data.bestAnswerId = postId;
      await prisma.post.updateMany({ where: { threadId }, data: { isBestAnswer: false } });
      await prisma.post.update({ where: { id: postId }, data: { isBestAnswer: true } });
      await prisma.moderationAction.create({
        data: {
          actorId: session.forumUserId,
          action: "best_answer",
          targetType: "post",
          targetId: postId,
        },
      });
    }

    const updated = await prisma.thread.update({ where: { id: threadId }, data });
    if (isMod(session.role)) {
      await prisma.moderationAction.create({
        data: {
          actorId: session.forumUserId,
          action: "thread_update",
          targetType: "thread",
          targetId: threadId,
          details: JSON.stringify(data),
        },
      });
    }
    return json({ thread: updated });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const session = await requireSession();
    const { id } = await ctx.params;
    const threadId = Number(id);
    const thread = await prisma.thread.findUnique({ where: { id: threadId } });
    if (!thread) return json({ error: "Not found" }, 404);
    if (!isMod(session.role) && thread.authorId !== session.forumUserId) {
      throw new AuthError("Forbidden", 403);
    }
    await prisma.thread.update({ where: { id: threadId }, data: { deletedAt: new Date() } });
    await prisma.moderationAction.create({
      data: {
        actorId: session.forumUserId,
        action: "thread_delete",
        targetType: "thread",
        targetId: threadId,
      },
    });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
