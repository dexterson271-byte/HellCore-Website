import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export async function GET() {
  // Safety check: only allow seeding if a database connection is configured.
  if (!process.env.DATABASE_URL) {
    return Response.json(
      { success: false, error: "DATABASE_URL is not set" },
      { status: 400 }
    );
  }

  try {
    // Import and run seed
    const { seed } = await import("../../../../prisma/seed");
    await seed();

    return Response.json({ success: true, message: "Database seeded successfully" });
  } catch (error) {
    console.error("Seeding failed:", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  } finally {
    await prisma.$disconnect();
  }
}
