import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const session = await requireStaff();
    const body = await req.json();
    const action = String(body.action || "");
    const userId = Number(body.userId);
    const reason = String(body.reason || "No reason provided");
    const hours = body.hours ? Number(body.hours) : null;
    const expiresAt = hours ? new Date(Date.now() + hours * 3600_000) : null;

    if (action === "ban") {
      await prisma.ban.create({
        data: { userId, issuerId: session.forumUserId, reason, expiresAt },
      });
    } else if (action === "mute") {
      await prisma.mute.create({
        data: { userId, issuerId: session.forumUserId, reason, expiresAt },
      });
    } else if (action === "unban") {
      await prisma.ban.deleteMany({ where: { userId } });
    } else if (action === "unmute") {
      await prisma.mute.deleteMany({ where: { userId } });
    } else if (action === "set_role") {
      await prisma.forumUser.update({
        where: { id: userId },
        data: { role: String(body.role || "member") },
      });
    } else {
      return json({ error: "Unknown action" }, 400);
    }

    await prisma.moderationAction.create({
      data: {
        actorId: session.forumUserId,
        action,
        targetType: "user",
        targetId: userId,
        details: reason,
      },
    });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
