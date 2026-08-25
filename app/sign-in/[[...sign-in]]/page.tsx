import Image from "next/image";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { SignIn } from "@clerk/nextjs";
import kinesisIcon from "@/app/icon.png";

const clerkAppearance = {
  variables: {
    colorPrimary: "#18181b",
    colorBackground: "#ffffff",
    colorText: "#18181b",
    colorTextSecondary: "#71717a",
    colorInputBackground: "#ffffff",
    colorInputText: "#18181b",
    borderRadius: "0.875rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "w-full shadow-none",
    card: "w-full gap-5 rounded-none bg-transparent p-0 shadow-none",
    header: "hidden",
    socialButtonsBlockButton: "h-12 rounded-xl border-zinc-200 font-medium shadow-none hover:bg-zinc-50",
    dividerLine: "bg-zinc-200",
    dividerText: "text-xs text-zinc-400",
    formFieldLabel: "text-sm font-medium text-zinc-700",
    formFieldInput: "h-12 rounded-xl border-zinc-200 shadow-none focus:border-zinc-400 focus:ring-0",
    formButtonPrimary: "h-12 rounded-xl bg-zinc-950 font-semibold shadow-none hover:bg-black",
    footerAction: "hidden",
  },
} as const;

export default function SignInPage() {
  return (
    <main className="relative min-h-screen overflow-hidden bg-[#f5f6f8] text-zinc-950">
      <div aria-hidden="true" className="absolute -left-28 -top-36 h-96 w-96 rounded-full bg-white blur-3xl" />
      <div aria-hidden="true" className="absolute -bottom-48 -right-32 h-[30rem] w-[30rem] rounded-full bg-zinc-200/60 blur-3xl" />

      <div className="relative mx-auto grid min-h-screen w-full max-w-[1440px] lg:grid-cols-[1.05fr_0.95fr]">
        <section className="flex flex-col justify-between px-6 py-8 sm:px-10 lg:px-16 lg:py-12 xl:px-24">
          <div className="flex items-center gap-3">
            <Image src={kinesisIcon} alt="" width={48} height={48} className="rounded-2xl shadow-sm" priority />
            <div>
              <p className="text-xl font-semibold tracking-tight">Kinesis</p>
              <p className="text-xs font-medium text-zinc-400">Life in motion</p>
            </div>
          </div>

          <div className="hidden max-w-xl lg:block">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-zinc-200 bg-white shadow-sm">
              <LockKeyhole className="h-5 w-5 text-zinc-700" />
            </span>
            <h1 className="mt-7 text-5xl font-semibold leading-[1.05] tracking-[-0.045em] xl:text-6xl">Your private workspace, securely within reach.</h1>
            <p className="mt-6 max-w-lg text-lg leading-8 text-zinc-500">Bring your documents, goals, finances, and relationships together in one calm, personal space.</p>
          </div>

          <div className="hidden items-center gap-2 text-sm text-zinc-500 lg:flex">
            <ShieldCheck className="h-4 w-4" />
            <span>Your workspace is private to your account.</span>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 pb-10 sm:px-10 lg:px-16 lg:py-12">
          <div className="w-full max-w-[470px] rounded-[2rem] border border-white/80 bg-white/95 p-6 shadow-[0_24px_80px_rgba(24,24,27,0.10)] backdrop-blur sm:p-9 lg:p-10">
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-zinc-400">Private access</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-[-0.035em] sm:text-[2.25rem]">Welcome back.</h2>
              <p className="mt-3 text-sm leading-6 text-zinc-500">Sign in to securely access your private Kinesis workspace.</p>
            </div>

            <SignIn path="/sign-in" routing="path" appearance={clerkAppearance} />

            <div className="mt-7 flex items-start gap-3 border-t border-zinc-100 pt-6 text-xs leading-5 text-zinc-500 lg:hidden">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-zinc-700" />
              <span>Your workspace is private to your account.</span>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
