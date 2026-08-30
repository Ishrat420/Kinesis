"use client";

import { useActionState } from "react";
import { Bell, Check, Clock3, Moon, Save, Sun } from "lucide-react";
import { updateSettingsAction, type SettingsActionState } from "./actions";

type Settings = {
  appearance: string;
  notificationsEnabled: boolean;
  remindersEnabled: boolean;
};

const initialState: SettingsActionState = {};

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState(updateSettingsAction, initialState);

  return (
    <form action={action} className="space-y-6">
      <section id="appearance" className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-lg font-semibold">Preferences &amp; appearance</h2>
        <p className="mt-1 text-sm text-zinc-500">Choose how Kinesis looks on this device.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {[
            { value: "light", label: "Light", Icon: Sun },
            { value: "dark", label: "Dark", Icon: Moon },
            { value: "system", label: "System", Icon: Check },
          ].map(({ value, label, Icon }) => (
            <label key={value} className="cursor-pointer">
              <input className="peer sr-only" type="radio" name="appearance" value={value} defaultChecked={settings.appearance === value} />
              <span className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-4 text-sm font-medium transition hover:bg-zinc-50 peer-checked:border-zinc-950 peer-checked:ring-1 peer-checked:ring-zinc-950">
                <Icon className="h-4 w-4" /> {label}
              </span>
            </label>
          ))}
        </div>
      </section>

      <section id="notifications" className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
        <h2 className="text-lg font-semibold">Notifications &amp; reminders</h2>
        <p className="mt-1 text-sm text-zinc-500">Decide when Kinesis should bring something to your attention.</p>
        <div className="mt-5 divide-y divide-zinc-100">
          <Toggle name="notificationsEnabled" defaultChecked={settings.notificationsEnabled} icon={Bell} title="In-app notifications" description="Show updates and alerts in Kinesis." />
          <Toggle name="remindersEnabled" defaultChecked={settings.remindersEnabled} icon={Clock3} title="Reminders" description="Get advance notice for upcoming dates." />
          <label className="flex items-center justify-between gap-5 py-4 text-sm">
            <span><span className="font-medium text-zinc-800">Remind me before</span><span className="mt-1 block text-zinc-500">Default notice for upcoming items.</span></span>
            <span className="flex items-center gap-2"><input disabled type="number" value="7" readOnly aria-label="Default reminder notice (unavailable)" className="h-10 w-20 rounded-xl border border-zinc-200 bg-zinc-100 px-3 text-right text-zinc-400" /><span className="text-zinc-400">days</span><span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">Unavailable</span></span>
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
