import { redirect } from "next/navigation";

// Analytics now lives on the account dashboard; keep old links working.
export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/accounts/${id}`);
}

export const instant = false;
