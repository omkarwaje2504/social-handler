"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./Modal";
import { ProfileForm } from "./ProfileForm";

/** "Edit profile" button that opens the profile form in a popup. */
export function EditProfileButton({
  accountId,
  username,
  pic,
  initial,
}: {
  accountId: string;
  username: string;
  pic: string | null;
  initial: { name: string; biography: string; website: string };
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <>
      <button type="button" className="secondary" onClick={() => setOpen(true)}>Edit profile</button>
      {open && (
        <Modal title="Edit profile" onClose={() => { setOpen(false); router.refresh(); }}>
          <div className="row" style={{ marginBottom: 12 }}>
            {pic ? <img className="avatar" src={pic} alt="" /> : <div className="avatar" />}
            <div>
              <div style={{ fontWeight: 700 }}>{username}</div>
              <div className="muted">Profile picture and username can only be changed in the Instagram app.</div>
            </div>
          </div>
          <ProfileForm accountId={accountId} initial={initial} />
        </Modal>
      )}
    </>
  );
}
