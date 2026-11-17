import type { Metadata } from "next";
import Link from "next/link";
import { BellRing, CalendarDays, FileText, Lock, Target, Wallet } from "lucide-react";

export const metadata: Metadata = {
  title: "Kinesis — your personal life manager",
  description: "Kinesis keeps your documents, deadlines, goals, finances and the people in your life in one private place, and reminds you before anything slips.",
};

const FEATURES = [
  { icon: FileText, title: "Documents", body: "Passports, licences, insurance and more, with expiry dates tracked and renewals reminded in good time." },
  { icon: CalendarDays, title: "Deadlines and to-dos", body: "Everything that is due, in one calendar, whichever part of your life it belongs to." },
  { icon: Target, title: "Goals", body: "Goals broken into milestones, with progress you can see." },
  { icon: Wallet, title: "Finance", body: "What you own, what you owe, and your monthly income and spending, at a glance." },
  { icon: BellRing, title: "Reminders", body: "A daily nudge on your phone or computer for what needs your attention." },
  { icon: Lock, title: "Private by design", body: "Your Kinesis is yours alone. Documents you scan are read on your device, never on our servers." },
];

/**
 * The public home page. Signed-out visitors to "/" see this (proxy.ts rewrites
 * to it); signed-in people get their dashboard there instead.
 */
export default function WelcomePage() {
  return (
    <>
      <section className="mx-auto w-full max-w-3xl px-4 pt-16 pb-12 text-center sm:px-8 sm:pt-24">
        <h1 className="text-4xl font-semibold tracking-[-0.04em] sm:text-6xl">Get your life in motion.</h1>
        <p className="mx-auto mt-5 max-w-xl text-lg text-zinc-500">
          Kinesis keeps your documents, deadlines, goals, finances and the people in your life in one private place, and reminds you before anything slips.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link href="/sign-in" className="w-full rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-700 sm:w-auto">
            Log in
          </Link>
          <Link href="/privacy" className="w-full rounded-xl border border-zinc-200 px-6 py-3 text-sm font-semibold text-zinc-800 transition hover:bg-zinc-50 sm:w-auto">
            How we handle your data
          </Link>
        </div>
        <p className="mt-4 text-sm text-zinc-400">Kinesis is invitation-only.</p>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 pb-20 sm:px-8">
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, body }) => (
            <li key={title} className="rounded-3xl bg-zinc-50 p-6">
              <Icon className="h-5 w-5 text-zinc-700" aria-hidden="true" />
              <h2 className="mt-4 font-semibold">{title}</h2>
              <p className="mt-1.5 text-sm leading-6 text-zinc-500">{body}</p>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
