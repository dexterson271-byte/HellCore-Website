import Link from "next/link";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const STORE = "https://store.hellcore.net";

export function SiteFooter() {
  return (
    <footer className="site-footer-wrap">
      <div className="site-footer-grid">
        <section className="footer-col">
          <h3>About Us</h3>
          <p>
            Hellcore is a competitive Minecraft network focused on PvP, community events,
            and a fair play environment. Join thousands of players across our game modes.
          </p>
        </section>

        <section className="footer-col">
          <h3>Useful Links</h3>
          <ul className="footer-links">
            <li><a href={MAIN}>Home</a></li>
            <li><a href={`${MAIN}/#rules`}>Rules &amp; Policies</a></li>
            <li><Link href="/c/help">Support</Link></li>
            <li><a href={STORE}>Store</a></li>
            <li><a href="https://discord.gg/hellcore">Discord</a></li>
            <li><a href={`${MAIN}/terms`}>Terms of Service</a></li>
            <li><a href={`${MAIN}/privacy`}>Privacy Policy</a></li>
          </ul>
        </section>

        <section className="footer-col">
          <h3>Community</h3>
          <p>Stay connected with Hellcore players, staff updates, and event announcements.</p>
          <div className="footer-social">
            <a href="https://discord.gg/hellcore" aria-label="Discord">Discord</a>
            <a href="https://youtube.com" aria-label="YouTube">YouTube</a>
            <a href="https://twitter.com" aria-label="Twitter">Twitter</a>
          </div>
        </section>

        <section className="footer-col">
          <h3>Hellcore Store</h3>
          <p>
            Purchasing ranks and cosmetics on our store helps support server development
            and keeps Hellcore online for everyone.
          </p>
          <a href={STORE} className="footer-store-btn">Visit the store</a>
        </section>
      </div>

      <div className="site-footer-bar">
        <span>© {new Date().getFullYear()} Hellcore Network. All Rights Reserved.</span>
        <div>
          <a href={MAIN}>Main site</a>
          {" · "}
          <a href={STORE}>Store</a>
          {" · "}
          <a href="https://discord.gg/hellcore">Discord</a>
        </div>
      </div>
    </footer>
  );
}
