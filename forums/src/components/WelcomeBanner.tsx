const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const LOGIN = `${MAIN}/?next=${encodeURIComponent("https://forums.hellcore.net")}`;

export function WelcomeBanner() {
  return (
    <section className="welcome-banner">
      <div className="welcome-banner-left">
        <div className="welcome-shield" aria-hidden />
        <div>
          <h2 className="welcome-title">Welcome to Hellcore Forums</h2>
          <p className="welcome-sub">Join the community — discuss the server, get support, and meet other players.</p>
        </div>
      </div>
      <div className="welcome-actions">
        <a href={LOGIN} className="btn primary">Create Account</a>
        <a href={LOGIN} className="btn">Log In</a>
      </div>
    </section>
  );
}
