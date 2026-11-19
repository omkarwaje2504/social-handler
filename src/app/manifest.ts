import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Web app manifest: installable as "SMC" on phones/desktop, with the brand icons and colors.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.full,
    short_name: BRAND.short,
    description: BRAND.description,
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: BRAND.themeDark,
    theme_color: BRAND.themeDark,
    categories: ["business", "productivity", "social"],
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
