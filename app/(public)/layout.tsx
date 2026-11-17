import Image from "next/image";
import Link from "next/link";
import kinesisIcon from "@/app/icon.png";

/**
 * Pages anyone can open without signing in: the public home page, privacy
 * policy and terms of service. Google's OAuth branding review checks all three
 * (KD-059), so they must not depend on a Clerk session or any account data.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-white text-zinc-950">
      <header className="border-b border-zinc-100">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4 sm:px-8">
          <Link href="/welcome" className="flex items-center gap-2.5 font-semibold tracking-[-0.02em]">
            <Image src={kinesisIcon} alt="" width={30} height={30} className="rounded-lg" />
            Kinesis
          </Link>
          <Link href="/sign-in" className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-700">
            Log in
          </Link>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-zinc-100">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-6 text-sm text-zinc-500 sm:px-8">
          <p>© {new Date().getFullYear()} Kinesis</p>
          <nav className="flex gap-5">
            <Link href="/welcome" className="hover:text-zinc-900">Home</Link>
            <Link href="/privacy" className="hover:text-zinc-900">Privacy policy</Link>
            <Link href="/terms" className="hover:text-zinc-900">Terms</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
