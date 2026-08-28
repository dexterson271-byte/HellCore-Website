import Link from "next/link";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";

export function ForumHero() {
  return (
    <section className="forum-hero">
      <div className="container forum-hero-inner">
        <Link href="/" className="forum-logo">
          HELLCORE
          <span>FORUMS</span>
        </Link>
        <div className="play-cta">
          <a href={MAIN} className="btn">
            Play Now
          </a>
          <div className="ip">mc.hellcore.net</div>
        </div>
      </div>
    </section>
  );
}
