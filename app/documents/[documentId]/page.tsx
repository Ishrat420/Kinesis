import { getDocument, getDocumentTypes } from "@/lib/data/documents";
import { ArrowLeft, FileText } from "lucide-react";
import Link from "next/link";
import { EditDocumentForm } from "./EditDocumentForm";
import { getExpiryDetails } from "@/lib/documents/expiry";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
import { formatDateInput } from "@/lib/dates";

const timeline = [
  { title: "Document uploaded", date: "2 Jul 2026" },
  { title: "Expiry reminder created", date: "2 Jul 2026" },
  { title: "AI extracted metadata", date: "2 Jul 2026" },
];

export default async function DocumentDetailPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const [document, documentTypes, user, linkOptions] = await Promise.all([getDocument(documentId), getDocumentTypes(), getCurrentUser(), getKinesisLinkOptions()]);

  if (!document) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-10 py-8 text-zinc-950">
        <h1 className="text-[38px] font-semibold">Document not found</h1>
      </main>
    );
  }
  const expiry = getExpiryDetails(document.expiryDate, document.prompt);
  const statusClass = { neutral: "bg-zinc-100 text-zinc-700", safe: "bg-emerald-50 text-emerald-700", soon: "bg-amber-50 text-amber-700", expired: "bg-red-50 text-red-700" }[expiry.urgency];

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-10 py-8 text-zinc-950">
      <div className="max-w-7xl">
        <div className="mb-6">
          <Link href="/documents" className="mb-4 inline-flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-base font-semibold text-zinc-700 shadow-sm transition hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-950 hover:shadow-md">
            <ArrowLeft className="h-5 w-5" /> Back to documents
          </Link>
          <p className="text-sm font-medium text-zinc-400">
            Documents / {document.name}
          </p>

          <div className="mt-3 flex items-start justify-between">
            <div>
              <h1 className="text-[38px] font-semibold leading-none tracking-tight">
                {document.name}
              </h1>
              <p className="mt-3 text-base text-zinc-500">{document.type}</p>
            </div>

            <span className={`rounded-full px-4 py-2 text-sm font-semibold ${statusClass}`}>
              {document.status}
            </span>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <div className="flex h-[420px] items-center justify-center rounded-3xl border border-dashed border-zinc-200 bg-zinc-50">
              <div className="text-center">
                <FileText className="mx-auto h-12 w-12 text-zinc-300" />
                <p className="mt-4 font-medium text-zinc-600">
                  File preview placeholder
                </p>
                <p className="mt-1 text-sm text-zinc-400">
                  Later this will show the uploaded document PDF/image.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <EditDocumentForm document={{
              id: document.id,
              name: document.name,
              type: document.type,
              status: document.status,
              expiryDate: toDateInput(document.expiryDate),
              issueDate: toDateInput(document.issueDate),
              documentNumber: document.documentNumber ?? "",
              country: document.country ?? "",
              notes: document.notes ?? "",
              link: document.link ?? "",
              prompt: document.prompt,
              expiryDateLabel: document.expiryDateLabel,
              issueDateLabel: document.issueDateLabel,
              documentNumberLabel: document.documentNumberLabel,
              countryLabel: document.countryLabel,
              notesLabel: document.notesLabel,
              linkLabel: document.linkLabel,
              customFields: document.customFields,
            }} documentTypes={documentTypes} ownerName={getUserDisplayName(user)} linkOptions={linkOptions} />
          </section>
        </div>

        <div className="mt-6">
          <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold">Timeline</h2>

            <div className="mt-5 space-y-4">
              {timeline.map((item) => (
                <div key={item.title} className="border-l border-zinc-200 pl-4">
                  <p className="font-medium text-zinc-800">{item.title}</p>
                  <p className="mt-1 text-sm text-zinc-400">{item.date}</p>
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>
    </main>
  );
}

function toDateInput(date: Date | null) {
  return date ? formatDateInput(date) : "";
}
