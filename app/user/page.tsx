import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { UserProfileForm } from "./UserProfileForm";

export default async function UserPage() {
  const user = await getCurrentUser();
  return <main className="min-h-screen bg-[#f7f8fb] text-zinc-950"><Topbar /><div className="flex"><Sidebar /><section className="flex-1 px-6 py-8 md:px-10"><div className="max-w-3xl">
    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">Account</p><h1 className="mt-2 text-[38px] font-semibold leading-none tracking-tight">Your profile</h1>
    <p className="mt-3 text-base leading-7 text-zinc-500">Keep your personal details up to date, {getUserDisplayName(user)}.</p><UserProfileForm user={user} />
  </div></section></div></main>;
}
