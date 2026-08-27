import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireSession, AuthError } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { renderMarkdown } from "@/lib/markdown";
import { slugify } from "@/lib/types";
import { awardXp, trackEvent } from "@/lib/notify";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const sort = searchParams.get("sort") || "activity";
    const q = searchParams.get("q")?.trim();
    const filter = searchParams.get("filter");
    const take = Math.min(50, Number(searchParams.get("limit") || 20));
    const skip = Math.max(0, Number(searchParams.get("offset") || 0));

    const where: Record<string, unknown> = { deletedAt: null, isArchived: false };
    if (category) where.category = { slug: category };
    if (filter === "featured") where.isFeatured = true;
    if (filter === "unanswered") where.replyCount = 0;
    if (filter === "solved") where.isSolved = true;
    if (filter === "announcements") where.isAnnouncement = true;
    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { searchText: { contains: q, mode: "insensitive" } },
      ];
    }

    const orderBy =
      sort === "new"
        ? [{ isPinned: "desc" as const }, { createdAt: "desc" as const }]
        : sort === "replies"
          ? [{ isPinned: "desc" as const }, { replyCount: "desc" as const }]
          : sort === "views"
            ? [{ isPinned: "desc" as const }, { views: "desc" as const }]
            : [{ isPinned: "desc" as const }, { lastActivityAt: "desc" as const }];

    const [rows, total] = await Promise.all([
      prisma.thread.findMany({
        where,
        orderBy,
        take,
        skip,
        include: {
          author: { select: { id: true, username: true, role: true, level: true, avatarUrl: true, reputation: true } },
          category: { select: { id: true, name: true, slug: true, color: true } },
        },
      }),
      prisma.thread.count({ where }),
    ]);

    return json({ threads: rows, total });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await requireSession();
    const rl = await rateLimit(`thread:${session.forumUserId}`, 8, 60_000);
    if (!rl.ok) return json({ error: "Slow down — too many threads" }, 429);

    const body = await req.json();
    const title = String(body.title || "").trim();
    const content = String(body.content || "").trim();
    const categoryId = Number(body.categoryId);
    if (title.length < 4 || content.length < 4) return json({ error: "Title and content required" }, 400);

    const category = await prisma.category.findUnique({ where: { id: categoryId } });
    if (!category) return json({ error: "Category not found" }, 404);

    const mute = await prisma.mute.findFirst({
      where: {
        userId: session.forumUserId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (mute) throw new AuthError("You are muted", 403);

    const ban = await prisma.ban.findFirst({
      where: {
        userId: session.forumUserId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    if (ban) throw new AuthError("You are banned", 403);

    let slug = slugify(title);
    const clash = await prisma.thread.findFirst({ where: { categoryId, slug } });
    if (clash) slug = `${slug}-${Date.now().toString(36)}`;

    const html = await renderMarkdown(content);
    const thread = await prisma.$transaction(async (tx) => {
      const t = await tx.thread.create({
        data: {
          categoryId,
          authorId: session.forumUserId,
          title,
          slug,
          searchText: `${title}\n${content}`,
          isAnnouncement: !!body.isAnnouncement && ["admin", "dev", "owner", "founder"].includes(session.role),
          isStaffOnly: !!body.isStaffOnly,
        },
      });
      await tx.post.create({
        data: {
          threadId: t.id,
          authorId: session.forumUserId,
          body: content,
          bodyHtml: html,
          depth: 0,
        },
      });
      await tx.category.update({
        where: { id: categoryId },
        data: { threadCount: { increment: 1 }, postCount: { increment: 1 } },
      });
      await tx.forumUser.update({
        where: { id: session.forumUserId },
        data: { threadCount: { increment: 1 }, postCount: { increment: 1 } },
      });
      return t;
    });

    if (body.poll?.question && Array.isArray(body.poll?.options)) {
      const options = (body.poll.options as string[]).map((o) => String(o).trim()).filter(Boolean).slice(0, 8);
      if (options.length >= 2) {
        await prisma.poll.create({
          data: {
            threadId: thread.id,
            question: String(body.poll.question).trim(),
            multiple: !!body.poll.multiple,
            options: { create: options.map((label) => ({ label })) },
          },
        });
      }
    }

    await awardXp(session.forumUserId, 50, "Created a thread");
    await trackEvent("thread_create", session.forumUserId, { threadId: thread.id });

    const achievement = await prisma.achievement.findUnique({ where: { key: "first_thread" } });
    if (achievement) {
      await prisma.userAchievement.upsert({
        where: { userId_achievementId: { userId: session.forumUserId, achievementId: achievement.id } },
        create: { userId: session.forumUserId, achievementId: achievement.id },
        update: {},
      });
    }

    return json({ thread }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
