import Link from "next/link";
import { Download, ExternalLink, Plug, UserRound } from "lucide-react";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getSettings } from "@/lib/data/settings";
import { SettingsForm } from "./SettingsForm";
import { getVapidPublicKey } from "@/lib/push/sender";
import { DeleteDataButton } from "./DeleteDataButton";
import { ExportDataButton } from "./ExportDataButton";

export default async function SettingsPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const displayName = getUserDisplayName(user);
  return <>
    <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex min-w-0 items-center gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-zinc-100"><UserRound className="h-5 w-5" /></span><div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Profile</p><h2 className="mt-1 truncate text-lg font-semibold">{displayName}</h2>{user.email && <p className="truncate text-sm text-zinc-500">{user.email}</p>}</div></div><Link href="/user" className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium transition hover:bg-zinc-50">Edit profile <ExternalLink className="h-4 w-4" /></Link></section>

    <div className="mt-6"><SettingsForm settings={settings} pushPublicKey={getVapidPublicKey()} /></div>

    <section id="privacy" className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><h2 className="text-lg font-semibold">Data &amp; privacy</h2><p className="mt-1 text-sm text-zinc-500">Your information belongs to you. Sensitive actions require a recent identity check.</p><div className="mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-100 p-4"><div className="flex items-center gap-3"><Download className="h-5 w-5" /><div><p className="text-sm font-medium">Export your data</p><p className="text-xs text-zinc-500">Verify your identity, then download everything in a portable JSON file.</p></div></div><ExportDataButton /></div><DeleteDataButton /></div></section>

    <section id="integrations" className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100"><Plug className="h-4 w-4" /></span><div><h2 className="text-lg font-semibold">Integrations</h2><p className="text-sm text-zinc-500">Connect your other tools to Kinesis.</p></div></div><div className="mt-5 rounded-2xl border border-dashed border-zinc-200 px-5 py-6 text-center"><p className="text-sm font-medium text-zinc-700">No integrations connected</p><p className="mt-1 text-xs text-zinc-400">Integration options are coming soon.</p></div></section>
  </>;
}
