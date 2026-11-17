import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_CONTACT_EMAIL, TERMS_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of service — Kinesis",
  description: "The terms for using Kinesis.",
};

/**
 * The public terms of service, linked from Google's OAuth branding page
 * (KD-059). Like /privacy, it must stay true of how Kinesis actually works.
 */
export default function TermsPage() {
  const mail = `mailto:${PRIVACY_CONTACT_EMAIL}`;
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 text-[15px] leading-7 text-zinc-700 sm:px-8 sm:py-16 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-zinc-950 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-zinc-950 [&_a]:underline [&_a]:underline-offset-2">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-4xl">Terms of service</h1>
      <p className="text-sm text-zinc-400">Last updated {TERMS_UPDATED}</p>

      <p>
        These terms apply when you use Kinesis, a personal organiser for documents, deadlines, goals, finances and
        relationships. By using Kinesis you agree to them. Our <Link href="/privacy">privacy policy</Link> explains how
        your data is handled.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>Kinesis is invitation-only. An account is for one person and must not be shared.</li>
        <li>You are responsible for what happens in your account.</li>
        <li>You must be at least 16 years old to use Kinesis.</li>
      </ul>

      <h2>Keeping your account secure</h2>
      <p>
        You are solely responsible for keeping the means of accessing your account secure. In particular, you are
        responsible for:
      </p>
      <ul>
        <li>keeping your password confidential, choosing one that is strong and not used elsewhere, and not sharing it with anyone;</li>
        <li>the security of any email account, Google account or other sign-in method linked to Kinesis, since anyone with access to it may be able to access your Kinesis account;</li>
        <li>the security of every device you use to sign in to Kinesis, or that has access to your email or other linked accounts, including keeping it locked, up to date and free of malicious software, and signing out of devices you do not control.</li>
      </ul>
      <p>
        Kinesis is not responsible for any loss, disclosure or misuse of your data that results from your password,
        linked accounts or devices being compromised, shared or left unsecured. If you believe your account or any of
        these has been compromised, change your password, secure the affected account or device, and contact us
        promptly.
      </p>

      <h2>Your content</h2>
      <ul>
        <li>What you put into Kinesis stays yours. We use it only to run Kinesis for you.</li>
        <li>You can export or delete your data at any time from Settings → Data &amp; privacy.</li>
        <li>You are responsible for having the right to store what you add.</li>
      </ul>

      <h2>Acceptable use</h2>
      <p>Do not use Kinesis to break the law, to store content you have no right to, or to try to access other people&apos;s accounts, disrupt the service or get around its security.</p>

      <h2>Connected services</h2>
      <p>
        If you connect another service, such as Google Drive, your use of it is also governed by that service&apos;s own
        terms. Files you save there are stored by that service, not by Kinesis, and stay there if you stop using Kinesis.
      </p>

      <h2>Reminders are a help, not a guarantee</h2>
      <p>
        Kinesis helps you keep track of dates such as document expiries and payments, but reminders can be late or
        missed: for example if a date is entered wrongly, notifications are turned off, or a device is offline. Details
        Kinesis reads from your documents are suggestions for you to check. You remain responsible for your own
        deadlines, renewals and decisions. Kinesis does not give legal, financial or medical advice.
      </p>

      <h2>Availability and changes</h2>
      <p>
        Kinesis is provided &quot;as is&quot;. We work to keep it running and your data safe, but we cannot promise it will
        always be available or error-free. We may change or add features. If we ever stop running Kinesis, we will give
        you notice and time to export your data.
      </p>

      <h2>Ending your use</h2>
      <p>
        You can stop using Kinesis at any time and ask us to close your account. We may suspend or close an account that
        breaks these terms, and will tell you why unless the law prevents it.
      </p>

      <h2>Liability</h2>
      <p>
        To the extent the law allows, Kinesis is not liable for indirect or consequential losses, or for losses caused by
        a missed reminder or an incorrect suggestion. Nothing in these terms limits rights you have that cannot be limited
        by law.
      </p>

      <h2>Changes to these terms</h2>
      <p>If these terms change, the date at the top will change too, and we will tell you in Kinesis about any significant change.</p>

      <h2>Contact</h2>
      <p>
        Questions about these terms: <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>.
      </p>

      <p className="mt-12 text-sm text-zinc-400">
        <Link href="/welcome">Back to Kinesis</Link>
      </p>
    </article>
  );
}
