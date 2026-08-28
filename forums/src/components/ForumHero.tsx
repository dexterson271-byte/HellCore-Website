import Link from "next/link";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const WORLD_BG = `${MAIN}/static/bg-hellcore.jpg`;
const LOGO = `${MAIN}/static/logo-glow.png`;

export function ForumHero() {
  return (
    <section className="hero">
      <div className="hero-world" style={{ backgroundImage: `url("${WORLD_BG}")` }} />
      <div className="hero-overlay" />
      <div className="hero-brand">
        <Link href="/">
          <img src={LOGO} alt="HELLCORE" onError={(e) => { (e.target as HTMLImageElement).src = `${MAIN}/static/logo.png`; }} />
        </Link>
      </div>
    </section>
  );
}
