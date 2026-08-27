import { prisma } from "./db";
import { publishUserEvent } from "./pusher";
import { NotificationType } from "@prisma/client";

export async function notify(opts: {
  userId: number;
  actorId?: number;
  type: NotificationType;
  title: string;
  body?: string;
  href?: string;
}) {
  if (opts.actorId && opts.actorId === opts.userId) return null;
  const row = await prisma.notification.create({
    data: {
      userId: opts.userId,
      actorId: opts.actorId,
      type: opts.type,
      title: opts.title,
      body: opts.body,
      href: opts.href,
    },
  });
  await publishUserEvent(opts.userId, "notification", row);
  return row;
}

export async function trackEvent(type: string, userId?: number | null, meta?: unknown) {
  try {
    await prisma.analyticsEvent.create({
      data: {
        type,
        userId: userId || null,
        meta: meta as object | undefined,
      },
    });
  } catch {
    /* ignore */
  }
}

export async function awardXp(userId: number, amount: number, reason?: string) {
  const user = await prisma.forumUser.update({
    where: { id: userId },
    data: {
      xp: { increment: amount },
      reputation: { increment: Math.max(1, Math.floor(amount / 5)) },
    },
  });
  const level = Math.max(1, Math.floor(Math.sqrt(user.xp / 50)) + 1);
  if (level !== user.level) {
    await prisma.forumUser.update({ where: { id: userId }, data: { level } });
  }
  if (reason) {
    await notify({
      userId,
      type: "SYSTEM",
      title: `+${amount} XP`,
      body: reason,
    });
  }
  return user;
}
