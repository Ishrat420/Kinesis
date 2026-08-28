"use client";

import { useActionState } from "react";
import { UserPlus, UsersRound } from "lucide-react";
import { inviteUserAction, revokeInvitationAction, setUserAccessAction, type UserManagementState } from "./user-actions";

type Member = { id: string; name: string; email: string; role: "OWNER" | "MEMBER"; status: "ACTIVE" | "REVOKED" };
type Invitation = { id: string; email: string; createdAt: string };

export function UserManagement({ members, invitations }: { members: Member[]; invitations: Invitation[] }) {
  const [state, action, pending] = useActionState(inviteUserAction, {} as UserManagementState);

  return (
    <section id="users" className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100"><UsersRound className="h-4 w-4" /></span><div><h2 className="text-lg font-semibold">Users &amp; invitations</h2><p className="text-sm text-zinc-500">Only people invited here can create an account and access Kinesis.</p></div></div>

      <form action={action} className="mt-5 flex flex-col gap-3 rounded-2xl border border-zinc-100 p-4 sm:flex-row">
        <label className="min-w-0 flex-1"><span className="sr-only">Email address</span><input required type="email" name="email" placeholder="person@example.com" className="h-11 w-full rounded-xl border border-zinc-200 px-3 text-sm outline-none focus:border-zinc-400" /></label>
        <button disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-medium text-white disabled:opacity-50"><UserPlus className="h-4 w-4" />{pending ? "Sending…" : "Send invitation"}</button>
      </form>
      {(state.error || state.message) && <p role={state.error ? "alert" : "status"} className={`mt-3 text-sm font-medium ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.error ?? state.message}</p>}

      <div className="mt-5 divide-y divide-zinc-100">
        {members.map((member) => <div key={member.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium">{member.name} <span className="ml-2 rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase text-zinc-500">{member.role}</span></p><p className="mt-1 text-xs text-zinc-500">{member.email} · {member.status.toLowerCase()}</p></div>{member.role === "MEMBER" && <button onClick={() => setUserAccessAction(member.id, member.status !== "ACTIVE")} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium hover:bg-zinc-50">{member.status === "ACTIVE" ? "Disable access" : "Restore access"}</button>}</div>)}
        {invitations.map((invitation) => <div key={invitation.id} className="flex flex-wrap items-center justify-between gap-4 py-4"><div><p className="text-sm font-medium">{invitation.email}</p><p className="mt-1 text-xs text-zinc-500">Invitation pending · sent {new Date(invitation.createdAt).toLocaleDateString()}</p></div><button onClick={() => revokeInvitationAction(invitation.id)} className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium hover:bg-zinc-50">Revoke invitation</button></div>)}
      </div>
    </section>
  );
}
