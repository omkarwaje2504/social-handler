import { connection } from "next/server";
import { requireAccess } from "@/lib/auth";

// Every /accounts/<id>/… page: only people with access to the account's project get past here.
export default async function AccountLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  await connection(); // per request: reads the session cookie
  await requireAccess("account", (await params).id);
  return children;
}
