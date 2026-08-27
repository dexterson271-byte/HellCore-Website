import { prisma } from "@/lib/db";
import { requireSession, requireStaff } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { isMod } from "@/lib/types";

export async function GET() {
  try {
    const session = await requireStaff();
    const reports = await prisma.report.findMany({
      where: { status: { in: ["OPEN", "REVIEWING"] } },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        reporter: { select: { username: true } },
        thread: { select: { id: true, title: true, slug: true } },
        post: { select: { id: true, threadId: true } },
      },
    });
    return json({ reports, role: session.role });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const session = await requireSession();
    const body = await req.json();
    if (body.action === "resolve" && isMod(session.role)) {
      await prisma.report.update({
        where: { id: Number(body.id) },
        data: { status: body.status || "RESOLVED", resolvedAt: new Date() },
      });
      return json({ ok: true });
    }
    const reason = String(body.reason || "").trim();
    if (!reason) return json({ error: "Reason required" }, 400);
    const report = await prisma.report.create({
      data: {
        reporterId: session.forumUserId,
        threadId: body.threadId ? Number(body.threadId) : null,
        postId: body.postId ? Number(body.postId) : null,
        reason,
        details: body.details || null,
      },
    });
    return json({ report }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
