import { NextResponse } from "next/server";
import { guardRole } from "@/lib/auth";
import { sql } from "@/lib/db";
import { checkDesignation, checkPersonName } from "@/lib/names";
import { MIN_PASSWORD, hashPassword } from "@/lib/password";
import { decodeHashes, setHash } from "@/lib/hash";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Create a person. Super admins create any role; admins create users for their own team, and can
// give them access to their own projects straight away.
export async function POST(req: Request) {
  const { deny, user: me } = await guardRole(["super_admin", "admin"]);
  if (deny) return deny;
  const b = await req.json().catch(() => ({}));
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const role = me.role === "super_admin" && ["super_admin", "admin", "user"].includes(b.role) ? b.role : "user";
  if (!EMAIL.test(email)) return NextResponse.json({ error: "Enter a valid email" }, { status: 400 });
  if (password.length < MIN_PASSWORD) return NextResponse.json({ error: `Password must be at least ${MIN_PASSWORD} characters` }, { status: 400 });
  const name = checkPersonName(b.name);
  if (!name.ok) return NextResponse.json({ error: name.error }, { status: 400 });
  const designation = checkDesignation(b.designation);
  if (!designation.ok) return NextResponse.json({ error: designation.error }, { status: 400 });

  const [exists] = await sql`select 1 from users where email = ${email}`;
  if (exists) return NextResponse.json({ error: "A user with this email already exists" }, { status: 409 });

  const [u] = await sql<{ id: number }[]>`
    insert into users (email, name, designation, role, password_hash, created_by)
    values (${email}, ${name.value}, ${designation.value}, ${role}, ${await hashPassword(password)}, ${me.id})
    returning id`;
  const code = await setHash("users", u.id);

  // Optional project access on creation, for users only: an admin picks from the projects they own;
  // a super admin's new user is a platform user and can join any active project.
  const projectIds = role === "user" ? decodeHashes("projects", b.projectIds) : [];
  if (projectIds.length) {
    await sql`
      insert into project_members (project_id, user_id, role, added_by)
      select p.id, ${u.id}, 'user', ${me.id} from projects p
      where p.id = any(${projectIds}::int[]) and p.status = 'active'
        and (${me.role === "super_admin"} or p.owner_id = ${me.id})
      on conflict do nothing`;
  }
  return NextResponse.json({ id: code });
}
