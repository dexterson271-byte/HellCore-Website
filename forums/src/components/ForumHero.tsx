import Link from "next/link";
import { HeroLogo } from "@/components/HeroLogo";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const WORLD_BG = `${MAIN}/static/bg-hellcore.jpg`;

export function ForumHero() {
  return (
    <section className="hero">
      <div className="hero-world" style={{ backgroundImage: `url("${WORLD_BG}")` }} />
      <div className="hero-overlay" />
      <div className="hero-brand">
        <Link href="/">
          <HeroLogo />
        </Link>
      </div>
    </section>
  );
}
