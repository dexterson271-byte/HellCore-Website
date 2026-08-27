import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.FORUMS_PUBLIC_URL || "https://forums.hellcore.net";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", "/messages"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
