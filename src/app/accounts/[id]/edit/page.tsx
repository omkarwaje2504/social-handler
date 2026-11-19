import { redirect } from "next/navigation";

// Profile editing moved into a popup on the profile page.
export default async function EditProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/accounts/${id}/profile`);
}
