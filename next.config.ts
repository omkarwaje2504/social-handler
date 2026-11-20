import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Public address via the Cloudflare tunnel (complete-ai-platform panel → "Social Handler tunnel").
  // Lets `next dev` serve its dev assets / HMR to that host, so the page hydrates through the tunnel.
  allowedDevOrigins: ["social-handler.informatia.ai", "127.0.0.1"],
  // In development the script/style file names stay the same after edits, and Cloudflare's
  // Browser Cache TTL turns "no-cache" into "max-age=14400", so browsers kept running old code for
  // hours. "no-store" is never cached by Cloudflare or the browser. Production builds use hashed
  // file names, so this only applies in dev.
  async headers() {
    const prod = process.env.NODE_ENV === "production";
    // Security headers on every response: no framing (clickjacking), no MIME sniffing, no plugins,
    // limited referrer, no camera/mic/location, HTTPS-only in production. API answers are never cached.
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
      { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
      { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
      ...(prod ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
    ];
    return [
      { source: "/:path*", headers: security },
      { source: "/api/:path*", headers: [{ key: "Cache-Control", value: "no-store" }] },
      ...(prod ? [] : [
        { source: "/_next/:path*", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
        { source: "/((?!api/).*)", headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }] },
      ]),
    ];
  },
};

export default nextConfig;
