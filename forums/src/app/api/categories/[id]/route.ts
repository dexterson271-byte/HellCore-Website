import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { handleApiError, json } from "@/lib/api";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    const body = await req.json();
    const category = await prisma.category.update({
      where: { id: Number(id) },
      data: {
        name: body.name,
        description: body.description,
        icon: body.icon,
        color: body.color,
        bannerUrl: body.bannerUrl,
        sortOrder: body.sortOrder,
        groupId: body.groupId,
        permissions: body.permissions,
      },
    });
    return json({ category });
  } catch (e) {
    return handleApiError(e);
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  try {
    await requireStaff();
    const { id } = await ctx.params;
    await prisma.category.delete({ where: { id: Number(id) } });
    return json({ ok: true });
  } catch (e) {
    return handleApiError(e);
  }
}
