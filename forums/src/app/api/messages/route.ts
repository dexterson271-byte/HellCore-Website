import { prisma } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { notify } from "@/lib/notify";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  try {
    const session = await requireSession();
    const parts = await prisma.conversationParticipant.findMany({
      where: { userId: session.forumUserId },
      include: {
        conversation: {
          include: {
            participants: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
            messages: { orderBy: { createdAt: "desc" }, take: 1 },
          },
        },
      },
      orderBy: { conversation: { updatedAt: "desc" } },
    });
    return json({
      conversations: parts.map((p) => p.conversation),
    });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const rl = await rateLimit(`pm:${session.forumUserId}`, 20, 60_000);
    if (!rl.ok) return json({ error: "Slow down" }, 429);
    const body = await req.json();
    const toUsername = String(body.to || "").trim();
    const content = String(body.body || "").trim();
    if (!toUsername || !content) return json({ error: "Recipient and message required" }, 400);
    const other = await prisma.forumUser.findUnique({ where: { username: toUsername } });
    if (!other) return json({ error: "User not found" }, 404);

    const conversation = await prisma.conversation.create({
      data: {
        subject: body.subject || null,
        participants: {
          create: [{ userId: session.forumUserId }, { userId: other.id }],
        },
        messages: {
          create: { authorId: session.forumUserId, body: content },
        },
      },
    });
    await notify({
      userId: other.id,
      actorId: session.forumUserId,
      type: "PM",
      title: `Message from ${session.username}`,
      body: content.slice(0, 120),
      href: `/messages/${conversation.id}`,
    });
    return json({ conversation }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
