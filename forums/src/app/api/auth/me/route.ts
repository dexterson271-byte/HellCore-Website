import { getSession } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return json({ user: null });
    const user = await prisma.forumUser.findUnique({ where: { id: session.forumUserId } });
    return json({ user: session, profile: user });
  } catch (e) {
    return handleApiError(e);
  }
}
