import { getDocuments, getDocumentTypes } from "@/lib/data/documents";
import Link from "next/link";
import { ArrowLeft, FileText, Plus, Search, ShieldCheck } from "lucide-react";
import { UploadDocumentButton } from "./UploadDocumentButton";
import { ManualDocumentButton } from "./ManualDocumentButton";


export default async function DocumentsPage() {
  const [documents, documentTypes] = await Promise.all([getDocuments(), getDocumentTypes()]);

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-10 py-8 text-zinc-950">
      <div className="max-w-7xl">
        <div className="flex items-start justify-between">
          <div>
            <Link href="/" className="mb-5 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-base font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 hover:shadow-md">
              <ArrowLeft className="h-5 w-5" /> Back to dashboard
            </Link>
            <h1 className="text-[38px] font-semibold leading-none tracking-tight">
              Documents
            </h1>

            <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">
              Store, track, and connect important documents.
              <br />
              Expiry dates and reminders stay visible.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <ManualDocumentButton documentTypes={documentTypes} />
            <UploadDocumentButton />
          </div>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-3">
          <StatCard icon={FileText} title="Tracked documents" value="12" />
          <StatCard icon={ShieldCheck} title="Active documents" value="9" />
          <StatCard icon={Plus} title="Expiring soon" value="3" />
        </div>

        <section className="mt-6 rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-lg font-semibold">All documents</h2>

            <div className="flex h-11 w-80 items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white px-4 text-zinc-400">
              <Search className="h-[18px] w-[18px]" />
              <input
                className="w-full bg-transparent text-sm outline-none placeholder:text-zinc-400"
                placeholder="Search documents..."
              />
            </div>
          </div>

          <div className="space-y-3">
            {documents.map((document) => (
              <Link
                key={document.id}
                href={`/documents/${document.id}`}
                className="grid grid-cols-[44px_1fr_180px_160px] items-center gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-blue-50">
                  <FileText className="h-[18px] w-[18px] text-zinc-700" />
                </div>

                <div>
                  <p className="font-semibold">{document.name}</p>
                  <p className="text-sm text-zinc-500">{document.type}</p>
                </div>

                <p className="text-sm text-zinc-500">
                  {document.expiryDate
                    ? document.expiryDate.toLocaleDateString("en-AU", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                      })
                    : "No expiry"}
                </p>

                <span className="w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium">
                  {document.status}
                </span>
              </Link>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
}: {
  icon: React.ElementType;
  title: string;
  value: string;
}) {
  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-5 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-blue-50">
          <Icon className="h-[18px] w-[18px] text-zinc-700" />
        </div>

        <p className="text-sm font-semibold text-zinc-700">{title}</p>
      </div>

      <p className="mt-6 text-[38px] font-semibold leading-none tracking-tight">
        {value}
      </p>
    </section>
  );
}
