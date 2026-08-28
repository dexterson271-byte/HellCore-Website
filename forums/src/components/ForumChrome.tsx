"use client";

import { usePathname } from "next/navigation";
import { ForumHero } from "@/components/ForumHero";
import { SiteNav } from "@/components/SiteNav";
import { SessionUser } from "@/lib/types";
import { useEffect } from "react";

export function ForumChrome({
  user,
  children,
}: {
  user: SessionUser | null;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  useEffect(() => {
    document.body.classList.toggle("home-page", isHome);
    document.body.classList.toggle("subpage", !isHome);
  }, [isHome]);

  return (
    <>
      {isHome && <ForumHero />}
      <SiteNav user={user} />
      {children}
    </>
  );
}
