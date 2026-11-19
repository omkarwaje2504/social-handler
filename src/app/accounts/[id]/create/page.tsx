import Link from "next/link";
import { connection } from "next/server";
import { UploadPostForm } from "@/components/UploadPostForm";

export default async function CreatePage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  return (
    <>
      <div className="row" style={{ marginBottom: 16 }}>
        <h1>Create new post</h1>
        <div className="spacer" />
        <Link className="btn secondary" href={`/accounts/${id}`}>Back to profile</Link>
      </div>
      <div className="card">
        <UploadPostForm accountId={id} />
      </div>
    </>
  );
}

export const instant = false;
