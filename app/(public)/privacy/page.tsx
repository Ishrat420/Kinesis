import type { Metadata } from "next";
import Link from "next/link";
import { PRIVACY_CONTACT_EMAIL, PRIVACY_POLICY_UPDATED } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy — Kinesis",
  description: "What Kinesis stores, how documents and Google Drive are handled, and how to remove your data.",
};

/**
 * The public privacy policy, linked from Google's OAuth branding page (KD-059).
 * Every statement here must stay true of the code: change this page in the
 * same commit as anything that changes what Kinesis stores or sends.
 */
export default function PrivacyPage() {
  const mail = `mailto:${PRIVACY_CONTACT_EMAIL}`;
  return (
    <article className="mx-auto w-full max-w-2xl px-4 py-12 text-[15px] leading-7 text-zinc-700 sm:px-8 sm:py-16 [&_h2]:mt-10 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:tracking-[-0.01em] [&_h2]:text-zinc-950 [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_a]:font-medium [&_a]:text-zinc-950 [&_a]:underline [&_a]:underline-offset-2">
      <h1 className="text-3xl font-semibold tracking-[-0.03em] text-zinc-950 sm:text-4xl">Privacy policy</h1>
      <p className="text-sm text-zinc-400">Last updated {PRIVACY_POLICY_UPDATED}</p>

      <p>
        Kinesis is a personal organiser for documents, deadlines, goals, finances and relationships. Each account is one
        person&apos;s own, private space. Kinesis is invitation-only, and no account can see another account&apos;s data.
        This policy explains what Kinesis stores, what it does not, and how you stay in control.
      </p>

      <h2>What we store</h2>
      <ul>
        <li><strong>Your account:</strong> your name and email address, from the sign-in you use.</li>
        <li><strong>What you enter:</strong> the documents, to-dos, goals, finance items, people, dates, notes and settings you add or confirm.</li>
        <li><strong>Activity history:</strong> a record of changes to your items, so you can see what changed and when.</li>
        <li><strong>Notifications:</strong> if you turn on push notifications, the address your browser gives us for delivering them to that device.</li>
        <li><strong>Security reports:</strong> technical reports your browser sends when it blocks unexpected content on a Kinesis page. These contain page addresses, not your data.</li>
      </ul>
      <p>We do not use analytics or advertising trackers, and we do not sell, rent or share your data.</p>

      <h2>Documents you scan</h2>
      <p>
        When you upload a document to fill in its details, Kinesis reads the file <strong>on your own device</strong>, in
        your browser. The file and the text read from it are not sent to Kinesis&apos;s servers. Only the details you
        check and save are stored, exactly as if you had typed them.
      </p>

      <h2>Google Drive</h2>
      <p>
        You can choose to connect Google Drive, so the files you upload are kept in your own Drive. This is optional.
        If you connect it:
      </p>
      <ul>
        <li>
          Kinesis asks only for the <strong>drive.file</strong> permission. It can see and manage only the files Kinesis
          itself saved to your Drive or that you choose to open with Kinesis. It cannot see anything else in your Drive.
        </li>
        <li>Your browser sends each file straight to your Drive, into a &quot;Kinesis&quot; folder. The file does not pass through or stay on Kinesis&apos;s servers.</li>
        <li>Kinesis stores the file&apos;s Drive ID, name, type and link, so the document can open it later.</li>
        <li>Kinesis never deletes files from your Drive. Deleting a document in Kinesis leaves its file where it is.</li>
        <li>Google data is used only to save and open your own files for you. It is never used for advertising, sold, used to train AI models, or read by people, except where you ask us for help, for security, or as the law requires.</li>
      </ul>
      <p>
        Kinesis&apos;s use and transfer to any other app of information received from Google APIs will adhere to the{" "}
        <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
          Google API Services User Data Policy
        </a>
        , including the Limited Use requirements.
      </p>
      <p>
        You can disconnect Google Drive at any time in Kinesis, or from your{" "}
        <a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">Google account&apos;s third-party connections</a>.
        Your files stay in your Drive.
      </p>

      <h2>Who processes your data</h2>
      <ul>
        <li><strong>Clerk</strong> runs sign-in and keeps your login details, such as your email, password and profile picture.</li>
        <li><strong>Our hosting and database providers</strong> run Kinesis and store the data described above.</li>
        <li><strong>Your browser&apos;s push service</strong> (for example Google, Apple or Mozilla) delivers notifications, if you turn them on.</li>
        <li><strong>Google</strong> stores the files you save to Drive, under Google&apos;s own terms, if you connect it.</li>
      </ul>
      <p>Data is sent over encrypted connections. Sign-in cookies are used only to keep you logged in.</p>

      <h2>Your choices</h2>
      <ul>
        <li><strong>Export:</strong> download all of your data from Settings → Data &amp; privacy.</li>
        <li><strong>Delete:</strong> delete all of your data from the same place. It is removed straight away and cannot be recovered.</li>
        <li><strong>Close your account:</strong> email us and we will delete your account and everything in it.</li>
        <li><strong>Notifications:</strong> turn push notifications off in Settings, or in your browser.</li>
      </ul>

      <h2>Children</h2>
      <p>Kinesis is not intended for children under 16.</p>

      <h2>Changes</h2>
      <p>If this policy changes, the date at the top will change too. We will tell you in Kinesis about any change in how your data is used.</p>

      <h2>Contact</h2>
      <p>
        Questions or requests about your data: <a href={mail}>{PRIVACY_CONTACT_EMAIL}</a>.
      </p>

      <p className="mt-12 text-sm text-zinc-400">
        <Link href="/welcome">Back to Kinesis</Link>
      </p>
    </article>
  );
}
