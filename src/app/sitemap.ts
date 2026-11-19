import type { MetadataRoute } from "next";
import { BRAND } from "@/lib/brand";

// Public pages only.
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: `${BRAND.url}/login`, lastModified: now, changeFrequency: "monthly", priority: 1 },
    { url: `${BRAND.url}/privacy`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BRAND.url}/terms`, lastModified: now, changeFrequency: "yearly", priority: 0.5 },
    { url: `${BRAND.url}/data-deletion`, lastModified: now, changeFrequency: "yearly", priority: 0.4 },
  ];
}
