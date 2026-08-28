import { SiteNav } from "@/components/SiteNav";
import { ForumHero } from "@/components/ForumHero";
import { getSession } from "@/lib/auth";
import { prisma } from "@/lib/db";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Hellcore Forums",
    template: "%s · Hellcore Forums",
  },
  description: "Official Hellcore Network community forums — Bedwars, SkyWars, support, and more.",
  metadataBase: new URL(process.env.FORUMS_PUBLIC_URL || "https://forums.hellcore.net"),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();
  let unread = 0;
  if (user) {
    unread = await prisma.notification.count({
      where: { userId: user.forumUserId, readAt: null },
    });
  }

  return (
    <html lang="en">
      <body>
        <ForumHero user={user} unread={unread} />
        <SiteNav />
        <main style={{ padding: "1.25rem 0 2rem" }}>{children}</main>
        <footer className="site-footer">
          <div className="container" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <span>© Hellcore Network Forums</span>
            <span>
              <a href="https://www.hellcore.net">Main site</a> · <a href="https://store.hellcore.net">Store</a> ·{" "}
              <a href="https://discord.gg/hellcore">Discord</a>
            </span>
          </div>
        </footer>
      </body>
    </html>
  );
}
