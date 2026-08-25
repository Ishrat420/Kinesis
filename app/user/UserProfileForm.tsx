"use client";

import { Save } from "lucide-react";
import { useActionState } from "react";
import { updateUserAction, type UserFormState } from "./actions";

type UserProfile = { firstName: string; lastName: string; preferredName: string | null; email: string };
const initialState: UserFormState = {};

export function UserProfileForm({ user }: { user: UserProfile }) {
  const [state, formAction, pending] = useActionState(updateUserAction, initialState);
  return <form action={formAction} className="mt-8 space-y-5 rounded-3xl border border-zinc-200/80 bg-white p-7 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
    <div className="grid gap-5 sm:grid-cols-2"><Field label="First name" name="firstName" value={user.firstName} required /><Field label="Last name" name="lastName" value={user.lastName} required /></div>
    <Field label="Preferred name" name="preferredName" value={user.preferredName ?? ""} hint="Optional — this is the name Kinesis will use throughout the app." />
    <Field label="Email" name="email" value={user.email} type="email" disabled hint="Your email comes from the Clerk account used to sign in and cannot be changed here." />
    {state.error && <p role="alert" className="text-sm font-medium text-red-600">{state.error}</p>}
    {state.success && <p role="status" className="text-sm font-medium text-emerald-700">Your profile has been updated everywhere.</p>}
    <div className="flex justify-end border-t border-zinc-100 pt-5"><button disabled={pending} className="flex items-center gap-2 rounded-xl bg-zinc-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-black disabled:opacity-50"><Save className="h-4 w-4" /> {pending ? "Saving…" : "Save profile"}</button></div>
  </form>;
}

function Field({ label, name, value, required, disabled, type = "text", hint }: { label: string; name: string; value: string; required?: boolean; disabled?: boolean; type?: string; hint?: string }) {
  return <label className="block text-sm font-medium text-zinc-700">{label}<input name={name} type={type} defaultValue={value} required={required} disabled={disabled} className="mt-2 h-12 w-full rounded-xl border border-zinc-200 px-4 outline-none transition focus:border-zinc-400 disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:text-zinc-500" />{hint && <span className="mt-2 block text-xs font-normal text-zinc-400">{hint}</span>}</label>;
}
