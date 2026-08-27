import { prisma } from "@/lib/db";
import { getSession, requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ notifications: [], unread: 0 });
    const notifications = await prisma.notification.findMany({
      where: { userId: session.forumUserId },
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { actor: { select: { username: true, avatarUrl: true } } },
    });
    const unread = await prisma.notification.count({
      where: { userId: session.forumUserId, readAt: null },
    });
    return json({ notifications, unread });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST() {
  try {
    const session = await requireSession();
    await prisma.notification.updateMany({
      where: { userId: session.forumUserId, readAt: null },
      data: { readAt: new Date() },
    });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
