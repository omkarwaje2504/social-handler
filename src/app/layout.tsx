import type { Metadata, Viewport } from "next";
import { BRAND } from "@/lib/brand";
import { connection } from "next/server";
import Script from "next/script";
import { sql } from "@/lib/db";
import type { AccountDoc } from "@/lib/models";
import { getUser, projectIdsFor, scopeSql } from "@/lib/auth";
import { Sidebar, type SidebarAccount, type SidebarProject } from "@/components/Sidebar";
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
  // Only signed-in people get the app chrome; the sidebar lists accounts they can open.
  const user = await getUser();

  let accounts: SidebarAccount[] = [];
  let projects: SidebarProject[] = [];
  if (user) {
    const ids = await projectIdsFor(user);
    const scope = scopeSql(ids, "a.project_id");
    projects = await sql<SidebarProject[]>`
      select p.hash as id, p.name, (select count(*)::int from accounts a where a.project_id = p.id) as accounts
      from projects p where ${scopeSql(ids, "p.id")} and p.status = 'active' order by p.name`;
    const rows = await sql<(Pick<AccountDoc, "username" | "name" | "profilePictureUrl"> & { id: string; projectId: string | null; projectName: string | null })[]>`
      select a.hash as id, a.username, a.name, a.profile_picture_url, p.hash as project_id, p.name as project_name
      from accounts a left join projects p on p.id = a.project_id
      where ${scope} order by a.created_at desc`;
    accounts = rows.map((a) => ({
      id: a.id, username: a.username, name: a.name ?? undefined, pic: a.profilePictureUrl ?? undefined,
      projectId: a.projectId ?? undefined, projectName: a.projectName ?? undefined,
    }));
  }

  return (
    // suppressHydrationWarning: data-theme is set on <html> before hydration, and browser extensions
    // (e.g. Grammarly) add attributes to <body>.
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        {/* Applies the saved light/dark choice before first paint. next/script injects it outside React,
            so it runs without the "script tag inside a React component" hydration error. */}
        <Script id="theme-init" strategy="beforeInteractive">{themeInitScript}</Script>
        {user ? (
          <div className="app">
            <Sidebar
              accounts={accounts}
              projects={projects}
              user={{ name: user.name, email: user.email, role: user.role, designation: user.designation }}
            />
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
