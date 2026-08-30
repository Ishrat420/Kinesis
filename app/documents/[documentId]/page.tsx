import { getDocument, getDocumentTypes } from "@/lib/data/documents";
import { FileText } from "lucide-react";
import { ModuleLayout } from "@/components/layout/ModuleLayout";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { EditDocumentForm } from "./EditDocumentForm";
import { getExpiryDetails } from "@/lib/documents/expiry";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";

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
      <ModuleLayout>
        <ModuleHeader
          backHref="/documents"
          backLabel="Back to documents"
          title="Document not found"
          description="This document may have been deleted."
        />
      </ModuleLayout>
    );
  }
  const expiry = getExpiryDetails(document.expiryDate, document.prompt);
  const statusClass = { neutral: "bg-zinc-100 text-zinc-700", safe: "bg-emerald-50 text-emerald-700", soon: "bg-amber-50 text-amber-700", expired: "bg-red-50 text-red-700" }[expiry.urgency];

  return (
    <ModuleLayout>
      <ModuleHeader
        className="mb-6"
        backHref="/documents"
        backLabel="Back to documents"
        breadcrumbs={[{ label: "Documents", href: "/documents" }, { label: document.name }]}
        title={document.name}
        description={document.type}
        actions={
          <span className={`rounded-full px-4 py-2 text-sm font-semibold ${statusClass}`}>
            {document.status}
          </span>
        }
      />

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
    </ModuleLayout>
  );
}

function toDateInput(date: Date | null) {
  return date ? date.toISOString().slice(0, 10) : "";
}
