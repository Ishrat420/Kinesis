import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { UserProfileForm } from "./UserProfileForm";
import { ManageAccountButton } from "./ManageAccountButton";
import { getAuthenticatedClerkUser } from "@/lib/auth";

export default async function UserPage() {
  const [user, account] = await Promise.all([getCurrentUser(), getAuthenticatedClerkUser()]);
  const email = account.primaryEmailAddress?.emailAddress ?? user.email;
  return <main className="min-h-screen bg-[#f7f8fb] text-zinc-950"><Topbar /><div className="flex"><Sidebar /><section className="flex-1 px-6 py-8 md:px-10"><div className="max-w-3xl">
    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">Personalization</p><h1 className="mt-2 text-[38px] font-semibold leading-none tracking-tight">Personal profile</h1>
    <p className="mt-3 text-base leading-7 text-zinc-500">Choose how Kinesis addresses you, {getUserDisplayName(user)}.</p>
    <section className="mt-8 flex flex-wrap items-center justify-between gap-5 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex min-w-0 items-center gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- Clerk provides the authenticated user's remote image URL. */}
        <img src={account.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
        <div className="min-w-0"><p className="font-semibold">{[account.firstName, account.lastName].filter(Boolean).join(" ") || `${user.firstName} ${user.lastName}`}</p><p className="truncate text-sm text-zinc-500">{email}</p><p className="mt-1 text-xs text-zinc-400">Name, email, photo, and security are managed by your signed-in account.</p></div>
      </div>
      <ManageAccountButton />
    </section>
    <UserProfileForm user={user} />
  </div></section></div></main>;
}
