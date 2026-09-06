"use client";

import { useActionState, useMemo, useState } from "react";
import { Bell, Clock3, Coins, Globe, MapPin, Save } from "lucide-react";
import { formatDate } from "@/lib/dates";
import { formatMoney } from "@/lib/format/numbers";
import { SUPPORTED_CURRENCIES, SUPPORTED_LOCALES, supportedTimeZones } from "@/lib/format/preferences";
import { updateSettingsAction, type SettingsActionState } from "./actions";

type Settings = {
  locale: string;
  currency: string;
  timeZone: string;
  notificationsEnabled: boolean;
  remindersEnabled: boolean;
  milestoneReminderLeadDays: number;
  relationshipReminderLeadDays: number;
  customItemReminderLeadDays: number;
};

// A day past the twelfth would not reveal whether the day or the month leads,
// so the preview uses one that reads differently from region to region.
const SAMPLE_DATE = new Date(Date.UTC(2026, 2, 9));
const SAMPLE_AMOUNT = 1234.5;

const initialState: SettingsActionState = {};

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateSettingsAction, initialState);
  const [locale, setLocale] = useState(settings.locale);
  const [currency, setCurrency] = useState(settings.currency);
  const [timeZone, setTimeZone] = useState(settings.timeZone);
  // Over four hundred of them, read from the runtime rather than hand-listed.
  // The stored value is folded in so a zone this browser does not enumerate --
  // an alias, or one it is simply older than -- cannot be silently dropped by
  // the picker the next time the form is saved.
  const zones = useMemo(() => [...new Set([...supportedTimeZones(), timeZone])].sort(), [timeZone]);
  const zoneNow = useMemo(() => {
    try {
      return new Intl.DateTimeFormat(locale, { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date());
    } catch {
      return null;
    }
  }, [locale, timeZone]);

  return (
    <form action={action} className="space-y-6">
      <section id="regional" className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-lg font-semibold">Region &amp; formatting</h2>
        <p className="mt-1 text-sm text-zinc-500">Set how Kinesis writes dates and amounts everywhere in the app.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-800"><Globe className="h-4 w-4" /> Region</span>
            <select name="locale" value={locale} onChange={(event) => setLocale(event.target.value)} className="input mt-2 appearance-none">
              {SUPPORTED_LOCALES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
            <span className="mt-2 block text-xs text-zinc-500">Dates appear as <strong className="font-semibold text-zinc-700">{formatDate(SAMPLE_DATE, locale)}</strong></span>
          </label>

          <label className="block">
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-800"><Coins className="h-4 w-4" /> Currency</span>
            <select name="currency" value={currency} onChange={(event) => setCurrency(event.target.value)} className="input mt-2 appearance-none">
              {SUPPORTED_CURRENCIES.map((option) => <option key={option.value} value={option.value}>{option.value} · {option.label}</option>)}
            </select>
            <span className="mt-2 block text-xs text-zinc-500">Amounts appear as <strong className="font-semibold text-zinc-700">{formatMoney(SAMPLE_AMOUNT, locale, currency)}</strong></span>
          </label>

          {/*
            Time zone decides one thing: which day Kinesis thinks it is. Every
            date is still stored and shown as the day it was entered on, so
            changing this moves no record -- it only moves the line between
            today and yesterday, which is what "due today" and "overdue" are
            counted from.
          */}
          <label className="block sm:col-span-2">
            <span className="flex items-center gap-2 text-sm font-medium text-zinc-800"><MapPin className="h-4 w-4" /> Time zone</span>
            <select name="timeZone" value={timeZone} onChange={(event) => setTimeZone(event.target.value)} className="input mt-2 appearance-none">
              {zones.map((zone) => <option key={zone} value={zone}>{zone.replaceAll("_", " ")}</option>)}
            </select>
            <span className="mt-2 block text-xs text-zinc-500">
              Decides which day counts as today, so a to-do due today says so from midnight where you are.
              {zoneNow && <> It is currently <strong className="font-semibold text-zinc-700">{zoneNow}</strong> there.</>}
            </span>
          </label>
        </div>
      </section>

      <section id="notifications" className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-lg font-semibold">Notifications &amp; reminders</h2>
        <p className="mt-1 text-sm text-zinc-500">Decide when Kinesis should bring something to your attention.</p>
        <div className="mt-5 divide-y divide-zinc-100">
          <Toggle name="notificationsEnabled" defaultChecked={settings.notificationsEnabled} icon={Bell} title="In-app notifications" description="Show updates and alerts in Kinesis." />
          <Toggle name="remindersEnabled" defaultChecked={settings.remindersEnabled} icon={Clock3} title="Reminders" description="Get advance notice for upcoming dates." />
          <label className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4 text-sm">
            <span className="min-w-[15rem] flex-1"><span className="font-medium text-zinc-800">Remind me about milestones</span><span className="mt-1 block text-zinc-500">How far ahead of a milestone&rsquo;s due date to start reminding you.</span></span>
            <span className="flex items-center gap-2">
              <input
                name="milestoneReminderLeadDays"
                type="number"
                min={0}
                max={365}
                step={1}
                defaultValue={settings.milestoneReminderLeadDays}
                aria-label="Days before a milestone's due date to start reminding"
                className="input h-10 w-20 px-3 text-right"
              />
              <span className="text-zinc-500">days before</span>
            </span>
          </label>
          <label className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4 text-sm">
            <span className="min-w-[15rem] flex-1"><span className="font-medium text-zinc-800">Remind me about important dates</span><span className="mt-1 block text-zinc-500">How far ahead of a birthday, anniversary or other important date to start reminding you.</span></span>
            <span className="flex items-center gap-2">
              <input
                name="relationshipReminderLeadDays"
                type="number"
                min={0}
                max={365}
                step={1}
                defaultValue={settings.relationshipReminderLeadDays}
                aria-label="Days before an important date to start reminding"
                className="input h-10 w-20 px-3 text-right"
              />
              <span className="text-zinc-500">days before</span>
            </span>
          </label>
          <label className="flex flex-wrap items-center justify-between gap-x-5 gap-y-3 py-4 text-sm">
            <span className="min-w-[15rem] flex-1"><span className="font-medium text-zinc-800">Remind me about custom item due dates</span><span className="mt-1 block text-zinc-500">How far ahead of a custom item&rsquo;s due date to start reminding you.</span></span>
            <span className="flex items-center gap-2">
              <input
                name="customItemReminderLeadDays"
                type="number"
                min={0}
                max={365}
                step={1}
                defaultValue={settings.customItemReminderLeadDays}
                aria-label="Days before a custom item's due date to start reminding"
                className="input h-10 w-20 px-3 text-right"
              />
              <span className="text-zinc-500">days before</span>
            </span>
          </label>
        </div>
      </section>

      {(state.error || state.message) && <p role={state.error ? "alert" : "status"} className={`text-sm font-medium ${state.error ? "text-red-600" : "text-emerald-700"}`}>{state.error ?? state.message}</p>}
      <div className="flex justify-end"><button disabled={pending} className="flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-3 text-sm font-medium text-white transition hover:bg-black disabled:opacity-50"><Save className="h-4 w-4" />{pending ? "Saving…" : "Save settings"}</button></div>
    </form>
  );
}

function Toggle({ name, defaultChecked, onChange, icon: Icon, title, description }: { name: string; defaultChecked: boolean; onChange?: (checked: boolean) => void; icon: React.ElementType; title: string; description: string }) {
  return <label className="flex cursor-pointer items-center justify-between gap-5 py-4"><span className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100"><Icon className="h-4 w-4" /></span><span className="text-sm"><span className="font-medium text-zinc-800">{title}</span><span className="mt-1 block text-zinc-500">{description}</span></span></span><input name={name} type="checkbox" defaultChecked={defaultChecked} onChange={(event) => onChange?.(event.target.checked)} className="h-5 w-5 accent-zinc-950" /></label>;
}
