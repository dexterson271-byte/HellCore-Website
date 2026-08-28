const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const LOGIN = `${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`;

export function WelcomeBanner() {
  return (
    <section className="welcome-banner">
      <div className="welcome-banner-left">
        <div className="welcome-shield" aria-hidden>💀</div>
        <div>
          <h2 className="welcome-title">Welcome to Hellcore Forums</h2>
          <p className="welcome-sub">Join the community — discuss Bedwars, SkyWars, get support, and more.</p>
        </div>
      </div>
      <div className="welcome-actions">
        <a href={LOGIN} className="btn">Create Account</a>
        <a href={LOGIN} className="btn-ghost">Log In</a>
      </div>
    </section>
  );
}
