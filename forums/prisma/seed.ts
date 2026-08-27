import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const GROUPS = [
  {
    name: "HELLCORE",
    slug: "hellcore",
    cats: [
      ["Announcements", "announcements", "Official network announcements"],
      ["Network News", "network-news", "News and updates"],
      ["Server Updates", "server-updates", "Patch notes and changes"],
      ["Events", "events", "Community and competitive events"],
    ],
  },
  {
    name: "GAMEPLAY",
    slug: "gameplay",
    cats: [
      ["BedWars", "bedwars", "Strategies, LFG, and clips"],
      ["SkyWars", "skywars", "Sky island PvP discussion"],
      ["Lifesteal", "lifesteal", "Hearts, bases, and SMP talk"],
      ["Survival", "survival", "Survival mode discussion"],
      ["Ranked", "ranked", "RBW and competitive play"],
    ],
  },
  {
    name: "COMMUNITY",
    slug: "community",
    cats: [
      ["General", "general", "General Hellcore chat"],
      ["Introductions", "introductions", "Say hello"],
      ["Off Topic", "off-topic", "Anything goes"],
      ["Media", "media", "Screenshots, videos, art"],
      ["Clans", "clans", "Recruit and organize"],
    ],
  },
  {
    name: "SUPPORT",
    slug: "support",
    cats: [
      ["Help", "help", "Ask the community"],
      ["Bug Reports", "bug-reports", "Report issues"],
      ["Suggestions", "suggestions", "Ideas for Hellcore"],
      ["Appeals", "appeals", "Punishment appeals"],
    ],
  },
  {
    name: "DEVELOPMENT",
    slug: "development",
    cats: [
      ["Developers", "developers", "Dev discussion"],
      ["Maps", "maps", "Map making"],
      ["Resource Packs", "resource-packs", "Packs and textures"],
      ["Plugins", "plugins", "Plugin talk"],
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
