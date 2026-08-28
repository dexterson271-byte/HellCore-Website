import { PrismaClient } from "@prisma/client";
import { renderMarkdown } from "../src/lib/markdown";

const prisma = new PrismaClient();

const GROUPS = [
  {
    name: "Categories",
    slug: "categories",
    cats: [
      ["Announcements", "announcements", "Official news and announcements from Hellcore."],
      ["Server Discussion", "server-discussion", "Discuss gameplay, updates, and server-related topics."],
      ["Suggestions", "suggestions", "Share your ideas and feedback to improve Hellcore."],
    ],
  },
  {
    name: "Community",
    slug: "community",
    cats: [
      ["General", "general", "General Hellcore chat and off-topic fun."],
      ["Introductions", "introductions", "Say hello to the community."],
      ["Media", "media", "Screenshots, videos, and clips."],
      ["Clans", "clans", "Recruit members and organize teams."],
    ],
  },
  {
    name: "Support",
    slug: "support",
    cats: [
      ["Help", "help", "Get help from staff and the community."],
      ["Bug Reports", "bug-reports", "Report server or client bugs."],
      ["Appeals", "appeals", "Punishment and ban appeals."],
    ],
  },
];

const STARTER_THREADS = [
  {
    categorySlug: "announcements",
    title: "Announcing Hellcore Forums",
    slug: "announcing-hellcore-forums",
    pinned: true,
    announcement: true,
    content: `Welcome to the official **Hellcore Forums**.

This is the home for server news, community discussion, support, and feedback. Whether you are a new player or a long-time member, you can:

- Read official announcements from the Hellcore team
- Discuss gameplay and server updates
- Share suggestions to improve the network
- Get help from staff and the community

**Getting started**
1. Log in with your Hellcore account from the main site.
2. Browse categories on the forum home page.
3. Introduce yourself in **Introductions** and join the conversation.

Thank you for being part of Hellcore Network.`,
  },
  {
    categorySlug: "help",
    title: "How to Connect to Hellcore",
    slug: "how-to-connect-to-hellcore",
    pinned: true,
    announcement: false,
    content: `Follow these steps to join Hellcore on Minecraft Java Edition.

## Server address
\`play.hellcore.net\`

## Steps
1. Open **Minecraft Java Edition** (1.20 or newer recommended).
2. Click **Multiplayer**.
3. Click **Add Server** or **Direct Connection**.
4. Enter the server address: **play.hellcore.net**
5. Join the server and have fun.

## Need help?
If you cannot connect, reply to this thread with your Minecraft version and any error message you see. Staff and community members can help you troubleshoot.`,
  },
];

async function seedStarterThreads(authorId: number) {
  for (const t of STARTER_THREADS) {
    const category = await prisma.category.findUnique({ where: { slug: t.categorySlug } });
    if (!category) continue;

    const existing = await prisma.thread.findFirst({
      where: { categoryId: category.id, slug: t.slug },
    });
    if (existing) continue;

    const html = await renderMarkdown(t.content);
    await prisma.$transaction(async (tx) => {
      const thread = await tx.thread.create({
        data: {
          categoryId: category.id,
          authorId,
          title: t.title,
          slug: t.slug,
          searchText: `${t.title}\n${t.content}`,
          isPinned: t.pinned,
          isAnnouncement: t.announcement,
          lastActivityAt: new Date(),
        },
      });

      await tx.post.create({
        data: {
          threadId: thread.id,
          authorId,
          body: t.content,
          bodyHtml: html,
          depth: 0,
        },
      });

      await tx.category.update({
        where: { id: category.id },
        data: { threadCount: { increment: 1 }, postCount: { increment: 1 } },
      });

      await tx.forumUser.update({
        where: { id: authorId },
        data: { threadCount: { increment: 1 }, postCount: { increment: 1 } },
      });
    });
  }
}

export async function seed() {
  await prisma.category.deleteMany({
    where: { slug: { in: ["bedwars", "skywars", "lifesteal", "ranked"] } },
  });
  await prisma.categoryGroup.deleteMany({ where: { slug: "gameplay" } });

  for (const [i, g] of GROUPS.entries()) {
    const group = await prisma.categoryGroup.upsert({
      where: { slug: g.slug },
      create: { name: g.name, slug: g.slug, sortOrder: i },
      update: { name: g.name, sortOrder: i },
    });
    for (const [j, [name, slug, description]] of g.cats.entries()) {
      await prisma.category.upsert({
        where: { slug },
        create: {
          groupId: group.id,
          name,
          slug,
          description,
          sortOrder: j,
          color: "#FF6B2C",
        },
        update: { name, description, groupId: group.id, sortOrder: j },
      });
    }
  }

  const staff = await prisma.forumUser.upsert({
    where: { username: "Hellcore" },
    create: {
      hellcoreId: 900_000_001,
      username: "Hellcore",
      displayName: "Hellcore Team",
      mcUsername: "Hellcore",
      role: "admin",
    },
    update: {
      displayName: "Hellcore Team",
      role: "admin",
    },
  });

  await seedStarterThreads(staff.id);

  const roles = [
    { name: "member", permissions: { post: true, reply: true, react: true } },
    { name: "helper", permissions: { post: true, reply: true, react: true, moderateLight: true } },
    { name: "mod", permissions: { post: true, reply: true, react: true, moderate: true } },
    { name: "admin", permissions: { all: true } },
    { name: "founder", permissions: { all: true } },
  ];
  for (const [i, r] of roles.entries()) {
    await prisma.role.upsert({
      where: { name: r.name },
      create: { name: r.name, permissions: r.permissions, sortOrder: i },
      update: { permissions: r.permissions, sortOrder: i },
    });
  }

  const badges = [
    { name: "Early Member", description: "Joined during forums launch", icon: "EM" },
    { name: "Helper", description: "Active community helper", icon: "HP" },
    { name: "Champion", description: "Top of the leaderboard", icon: "CH" },
    { name: "Bug Hunter", description: "Reported verified bugs", icon: "BH" },
  ];
  for (const b of badges) {
    await prisma.badge.upsert({
      where: { name: b.name },
      create: b,
      update: b,
    });
  }

  const achievements = [
    { key: "first_post", name: "First Steps", description: "Create your first post", xpReward: 25 },
    { key: "first_thread", name: "Conversation Starter", description: "Create your first thread", xpReward: 50 },
    { key: "solved_help", name: "Problem Solver", description: "Mark a best answer in Help", xpReward: 75 },
    { key: "100_posts", name: "Centurion", description: "Reach 100 posts", xpReward: 200 },
  ];
  for (const a of achievements) {
    await prisma.achievement.upsert({
      where: { key: a.key },
      create: a,
      update: a,
    });
  }

  const flags = ["realtime", "polls", "uploads", "pms", "discover", "analytics"];
  for (const key of flags) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: true },
      update: { enabled: true },
    });
  }

  console.log("Seed complete");
}

// Only run automatically when this file is executed directly (e.g. `npm run db:seed`),
// not when imported (e.g. by the temporary /api/seed route).
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .catch((e) => {
      console.error(e);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
