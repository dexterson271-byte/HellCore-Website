import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";
import { slugify } from "@/lib/types";

export async function GET() {
  try {
    const groups = await prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          orderBy: { sortOrder: "asc" },
          include: {
            moderators: { include: { user: { select: { id: true, username: true } } } },
          },
        },
      },
    });
    return json({ groups });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    await requireStaff();
    const body = await req.json();
    const name = String(body.name || "").trim();
    if (!name) return json({ error: "Name required" }, 400);
    const slug = slugify(body.slug || name);
    const category = await prisma.category.create({
      data: {
        name,
        slug,
        description: body.description || null,
        icon: body.icon || null,
        color: body.color || "#FF6B2C",
        bannerUrl: body.bannerUrl || null,
        groupId: body.groupId ? Number(body.groupId) : null,
        sortOrder: Number(body.sortOrder || 0),
        permissions: body.permissions || undefined,
      },
    });
    return json({ category }, 201);
  } catch (e) {
    return handleApiError(e);
  }
}
