import { PrismaClient } from "@prisma/client";

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
    name: "Gameplay",
    slug: "gameplay",
    cats: [
      ["BedWars", "bedwars", "Strategies, LFG, and competitive BedWars talk."],
      ["SkyWars", "skywars", "Sky island PvP discussion and clips."],
      ["Lifesteal", "lifesteal", "Hearts, bases, and SMP discussion."],
      ["Ranked", "ranked", "RBW and competitive ranked play."],
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

async function main() {
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
    { name: "Early Member", description: "Joined during forums launch", icon: "⭐" },
    { name: "Helper", description: "Active community helper", icon: "🛟" },
    { name: "Champion", description: "Top of the leaderboard", icon: "🏆" },
    { name: "Bug Hunter", description: "Reported verified bugs", icon: "🐛" },
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

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
