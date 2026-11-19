import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Only the public legal pages and the login page may be indexed; the dashboard, accounts, inbox and
// APIs are private (they also require a login and send noindex).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/login", "/privacy", "/terms", "/data-deletion"],
        disallow: ["/", "/accounts/", "/posts/", "/api/", "/connect/", "/connected", "/uploads/"],
      },
    ],
    sitemap: `${BRAND.url}/sitemap.xml`,
    host: BRAND.url,
  };
}
