import Image from "next/image";
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
    <main className="flex min-h-screen items-center justify-center bg-white px-5 py-12 text-zinc-950 sm:px-8">
      <section className="w-full max-w-[440px]">
        <div className="mb-9 text-center">
          <Image src={kinesisIcon} alt="Kinesis" width={52} height={52} className="mx-auto rounded-2xl shadow-sm" priority />
          <h1 className="mt-6 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">Log in to Kinesis</h1>
          <p className="mt-2 text-lg font-medium text-zinc-400">Get your life in motion.</p>
        </div>

        <SignIn path="/sign-in" routing="path" appearance={clerkAppearance} />
      </section>
    </main>
  );
}
