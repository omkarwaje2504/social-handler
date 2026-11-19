import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Public address via the Cloudflare tunnel (complete-ai-platform panel → "Social Handler tunnel").
  // Lets `next dev` serve its dev assets / HMR to that host, so the page hydrates through the tunnel.
  allowedDevOrigins: ["social-handler.informatia.ai"],
  // In development the script/style file names stay the same after edits, and Cloudflare's
  // Browser Cache TTL turns "no-cache" into "max-age=14400", so browsers kept running old code for
  // hours. "no-store" is never cached by Cloudflare or the browser. Production builds use hashed
  // file names, so this only applies in dev.
  async headers() {
    if (process.env.NODE_ENV === "production") return [];
    return [
      { source: "/_next/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
      { source: "/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
    ];
  },
};

export default nextConfig;
