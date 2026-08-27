/**
 * One-time migration from legacy Hellcore hc_forums (+ replies) into forums Postgres.
 *
 * Usage:
 *   LEGACY_DATABASE_URL=mysql://... DATABASE_URL=postgresql://... npx tsx scripts/migrate-legacy.ts
 *
 * Expects legacy tables: hc_forums, hc_forum_replies (or similar), hc_users
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type LegacyThread = {
  id: number;
  title: string;
  content: string;
  author_id: number;
  category: string;
  views: number;
  is_pinned: number;
  is_locked: number;
  created_at: Date;
};

type LegacyReply = {
  id: number;
  forum_id: number;
  author_id: number;
  content: string;
  created_at: Date;
};

type LegacyUser = {
  id: number;
  username: string;
  email?: string;
  role?: string;
  mc_username?: string;
};

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "thread";
}

async function main() {
  const legacyUrl = process.env.LEGACY_DATABASE_URL;
  if (!legacyUrl) {
    console.error("Set LEGACY_DATABASE_URL");
    process.exit(1);
  }

  // Dynamic mysql2 to avoid hard dependency if unused
  const mysql = await import("mysql2/promise");
  const conn = await mysql.createConnection(legacyUrl);

  const [users] = await conn.query<any[]>("SELECT id, username, email, role, mc_username FROM hc_users");
  const userMap = new Map<number, number>();
  for (const u of users as LegacyUser[]) {
    const fu = await prisma.forumUser.upsert({
      where: { hellcoreId: u.id },
      create: {
        hellcoreId: u.id,
        username: u.username,
        email: u.email || null,
        role: (u.role || "member").toLowerCase(),
        mcUsername: u.mc_username || null,
      },
      update: {
        username: u.username,
        email: u.email || null,
        role: (u.role || "member").toLowerCase(),
      },
    });
    userMap.set(u.id, fu.id);
  }
  console.log(`Users synced: ${userMap.size}`);

  const [threads] = await conn.query<any[]>("SELECT * FROM hc_forums ORDER BY id ASC");
  let imported = 0;
  for (const t of threads as LegacyThread[]) {
    const authorId = userMap.get(t.author_id);
    if (!authorId) continue;
    let category = await prisma.category.findFirst({
      where: { OR: [{ slug: slugify(t.category || "general") }, { name: { equals: t.category, mode: "insensitive" } }] },
    });
    if (!category) {
      category = await prisma.category.findFirst({ where: { slug: "general" } });
    }
    if (!category) continue;

    let slug = slugify(t.title);
    const clash = await prisma.thread.findFirst({ where: { categoryId: category.id, slug } });
    if (clash) slug = `${slug}-legacy-${t.id}`;

    const thread = await prisma.thread.create({
      data: {
        categoryId: category.id,
        authorId,
        title: t.title,
        slug,
        views: t.views || 0,
        isPinned: !!t.is_pinned,
        isLocked: !!t.is_locked,
        searchText: `${t.title}\n${t.content}`,
        createdAt: t.created_at || new Date(),
        lastActivityAt: t.created_at || new Date(),
      },
    });
    await prisma.post.create({
      data: {
        threadId: thread.id,
        authorId,
        body: t.content || "",
        bodyHtml: t.content || "",
        createdAt: t.created_at || new Date(),
      },
    });

    try {
      const [replies] = await conn.query<any[]>(
        "SELECT * FROM hc_forum_replies WHERE forum_id = ? ORDER BY id ASC",
        [t.id]
      );
      for (const r of replies as LegacyReply[]) {
        const rid = userMap.get(r.author_id);
        if (!rid) continue;
        await prisma.post.create({
          data: {
            threadId: thread.id,
            authorId: rid,
            body: r.content || "",
            bodyHtml: r.content || "",
            createdAt: r.created_at || new Date(),
          },
        });
        await prisma.thread.update({
          where: { id: thread.id },
          data: { replyCount: { increment: 1 }, lastActivityAt: r.created_at || new Date() },
        });
      }
    } catch {
      // replies table may be named differently
    }
    imported += 1;
  }

  console.log(`Threads imported: ${imported}`);
  await conn.end();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
