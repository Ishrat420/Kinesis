import Link from "next/link";
import { Cloud, Download, ExternalLink, Plug, UserRound } from "lucide-react";
import { Sidebar } from "@/components/navigation/Sidebar";
import { Topbar } from "@/components/navigation/Topbar";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getSettings } from "@/lib/data/settings";
import { SettingsForm } from "./SettingsForm";
import { DeleteDataButton } from "./DeleteDataButton";
import { ExportDataButton } from "./ExportDataButton";

export default async function SettingsPage() {
  const [user, settings] = await Promise.all([getCurrentUser(), getSettings()]);
  const displayName = getUserDisplayName(user);
  return <main className="min-h-screen bg-[#f7f8fb] text-zinc-950"><Topbar /><div className="flex"><Sidebar /><section className="min-w-0 flex-1 px-6 py-8 md:px-10"><div className="max-w-4xl">
    <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">System</p><h1 className="mt-2 text-[38px] font-semibold leading-none tracking-tight">Settings</h1><p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">Control how Kinesis looks, notifies you, and handles your data.</p>

    <section className="my-8 flex items-center justify-between gap-5 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-center gap-4"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-zinc-100"><UserRound className="h-5 w-5" /></span><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">Profile</p><h2 className="mt-1 text-lg font-semibold">{displayName}</h2>{user.email && <p className="text-sm text-zinc-500">{user.email}</p>}</div></div><Link href="/user" className="inline-flex items-center gap-2 rounded-xl border border-zinc-200 px-4 py-2.5 text-sm font-medium transition hover:bg-zinc-50">Edit profile <ExternalLink className="h-4 w-4" /></Link></section>

    <SettingsForm settings={settings} />

    <section id="privacy" className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><h2 className="text-lg font-semibold">Data &amp; privacy</h2><p className="mt-1 text-sm text-zinc-500">Your information belongs to you. Sensitive actions require a recent identity check.</p><div className="mt-5 space-y-4"><div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-100 p-4"><div className="flex items-center gap-3"><Download className="h-5 w-5" /><div><p className="text-sm font-medium">Export your data</p><p className="text-xs text-zinc-500">Verify your identity, then download everything in a portable JSON file.</p></div></div><ExportDataButton /></div><div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-red-100 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50"><Cloud className="h-4 w-4 text-red-600" /></span><div><p className="text-sm font-medium text-red-700">Delete your data</p><p className="text-xs text-zinc-500">Verify your identity and enter a confirmation phrase before permanently removing everything.</p></div></div><DeleteDataButton /></div></div></section>

    <section id="integrations" className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]"><div className="flex items-center gap-3"><span className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-100"><Plug className="h-4 w-4" /></span><div><h2 className="text-lg font-semibold">Integrations</h2><p className="text-sm text-zinc-500">Connect your other tools to Kinesis.</p></div></div><div className="mt-5 rounded-2xl border border-dashed border-zinc-200 px-5 py-6 text-center"><p className="text-sm font-medium text-zinc-700">No integrations connected</p><p className="mt-1 text-xs text-zinc-400">Integration options are coming soon.</p></div></section>
  </div></section></div></main>;
}
