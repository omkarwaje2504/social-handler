import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { cookies } from "next/headers";
import { connection } from "next/server";
import Script from "next/script";
import { sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { SESSION_COOKIE, isValidSession } from "@/lib/session";
import { Sidebar, type SidebarAccount } from "@/components/Sidebar";
import { ThemeToggle, themeInitScript } from "@/components/ThemeToggle";
import "./globals.css";
import "./components.css";

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: BRAND.full, template: `%s · ${BRAND.short}` },
  description: BRAND.description,
  applicationName: BRAND.full,
  keywords: [
    "Instagram analytics", "social media management", "Instagram auto DM", "comment to DM automation",
    "Instagram inbox", "reels analytics", "follower growth", "audience regions", "post scheduler", "SMC",
  ],
  authors: [{ name: "Sai Ashirwad Informatia" }],
  creator: "Sai Ashirwad Informatia",
  publisher: "Sai Ashirwad Informatia",
  category: "business",
  alternates: { canonical: "/" },
  // The app is private: pages are not indexed unless a page opts in (login + legal pages do).
  robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
  openGraph: {
    type: "website",
    siteName: BRAND.full,
    title: BRAND.full,
    description: BRAND.tagline,
    url: "/",
    locale: "en_IN",
  },
  twitter: { card: "summary_large_image", title: BRAND.full, description: BRAND.tagline },
  appleWebApp: { capable: true, title: BRAND.short, statusBarStyle: "black-translucent" },
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark light",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: BRAND.themeDark },
    { media: "(prefers-color-scheme: light)", color: BRAND.themeLight },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  await connection();
  // Only signed-in admins get the sidebar (and the user list). Public pages render bare.
  const admin = await isValidSession((await cookies()).get(SESSION_COOKIE)?.value);

  let accounts: SidebarAccount[] = [];
  if (admin) {
    const rows = await sql<Pick<AccountDoc, "id" | "username" | "name" | "profilePictureUrl">[]>`
      select id, username, name, profile_picture_url from accounts order by created_at desc`;
    accounts = rows.map((a) => ({ id: a.id, username: a.username, name: a.name ?? undefined, pic: a.profilePictureUrl ?? undefined }));
  }

  return (
    // suppressHydrationWarning: data-theme is set on <html> before hydration, and browser extensions
    // (e.g. Grammarly) add attributes to <body>.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Applies the saved light/dark choice before first paint. next/script injects it outside React,
            so it runs without the "script tag inside a React component" hydration error. */}
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        {admin ? (
          <div className="app">
            <Sidebar accounts={accounts} />
            <main className="content">{children}</main>
          </div>
        ) : (
          <>
            <ThemeToggle floating />
            <main>{children}</main>
          </>
        )}
      </body>
    </html>
  );
}
