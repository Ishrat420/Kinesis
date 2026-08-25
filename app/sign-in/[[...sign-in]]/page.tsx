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
    rootBox: { width: "100%", margin: "0 auto" },
    cardBox: { width: "100%", overflow: "visible", boxShadow: "none" },
    card: { width: "100%", overflow: "visible", padding: 0, background: "transparent", border: 0, borderRadius: 0, boxShadow: "none" },
    header: { display: "none" },
    main: { padding: "0.25rem 0.5rem 0.75rem" },
    socialButtonsBlockButton: { height: "3rem", borderRadius: "0.75rem", boxShadow: "none" },
    dividerLine: { backgroundColor: "#e4e4e7" },
    dividerText: { color: "#a1a1aa", fontSize: "0.75rem" },
    formFieldLabel: { color: "#3f3f46", fontSize: "0.875rem", fontWeight: 500 },
    formFieldInput: { height: "3rem", borderColor: "#e4e4e7", borderRadius: "0.75rem", boxShadow: "none" },
    formButtonPrimary: { height: "3rem", borderRadius: "0.75rem", backgroundColor: "#18181b", boxShadow: "none", fontWeight: 600 },
    footer: { display: "none" },
    footerAction: { display: "none" },
  },
} as const;

export default function SignInPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-white px-5 py-12 text-zinc-950 sm:px-8">
      <section className="mx-auto w-full max-w-[440px]">
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
