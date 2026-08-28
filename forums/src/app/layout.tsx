import { SiteNav } from "@/components/SiteNav";
import { ForumHero } from "@/components/ForumHero";
import { getSession } from "@/lib/auth";
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

  return (
    <html lang="en">
      <body>
        <ForumHero />
        <SiteNav user={user} />
        {children}
        <footer className="site-footer">
          <span>© Hellcore Network Forums</span>
          <div>
            <a href="https://www.hellcore.net">Main site</a>
            {" · "}
            <a href="https://store.hellcore.net">Store</a>
            {" · "}
            <a href="https://discord.gg/hellcore">Discord</a>
          </div>
        </footer>
      </body>
    </html>
  );
}
