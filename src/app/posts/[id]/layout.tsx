import { connection } from "next/server";
import { requireAccess } from "@/lib/auth";

// Post pages: only people with access to the post's project get past here.
export default async function PostLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await connection(); // per request: reads the session cookie
  await requireAccess("post", (await params).id);
  return children;
}
