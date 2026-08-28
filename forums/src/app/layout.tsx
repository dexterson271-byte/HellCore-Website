import { ForumChrome } from "@/components/ForumChrome";
import { SiteFooter } from "@/components/SiteFooter";
import { getSession } from "@/lib/auth";
import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    default: "Hellcore Forums",
    template: "%s · Hellcore Forums",
  },
  description: "Official Hellcore Network community forums — support, community, and more.",
  metadataBase: new URL(process.env.FORUMS_PUBLIC_URL || "https://forums.hellcore.net"),
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getSession();

  return (
    <html lang="en">
      <body>
        <ForumChrome user={user}>{children}</ForumChrome>
        <SiteFooter />
      </body>
    </html>
  );
}
