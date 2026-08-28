"use client";

const MAIN = process.env.NEXT_PUBLIC_MAIN_SITE_URL || "https://www.hellcore.net";
const LOGO = `${MAIN}/static/logo-glow.png`;
const FALLBACK = `${MAIN}/static/logo.png`;

export function HeroLogo() {
  return (
    <img
      src={LOGO}
      alt="HELLCORE"
      onError={(e) => {
        (e.target as HTMLImageElement).src = FALLBACK;
      }}
    />
  );
}
