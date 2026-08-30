import Link from "next/link";
import { AlertTriangle, CalendarDays, FileText } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getExpiringDocuments } from "@/lib/data/documents";
import { getExpiryDetails } from "@/lib/documents/expiry";
import { formatDate } from "@/lib/dates";

type DocumentList = Awaited<ReturnType<typeof getExpiringDocuments>>["upcoming"];

function DocumentSection({
  title,
  documents,
  now,
  expired = false,
}: {
  title: string;
  documents: DocumentList;
  now: Date;
  expired?: boolean;
}) {
  const Icon = expired ? AlertTriangle : CalendarDays;

  return (
    <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
      <div className="mb-5 flex items-center gap-3">
        <Icon className={`h-5 w-5 ${expired ? "text-rose-600" : "text-blue-600"}`} />
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-500">
          {documents.length}
        </span>
      </div>

      {documents.length ? (
        <div className="divide-y divide-zinc-100">
          {documents.map((document) => {
            const expiry = getExpiryDetails(document.expiryDate, document.prompt, now);
            return (
              <Link
                key={document.id}
                href={`/documents/${document.id}`}
                className="group flex items-center gap-4 py-4 first:pt-1 last:pb-0"
              >
                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${expired ? "bg-rose-50 text-rose-700" : "bg-blue-50 text-blue-700"}`}>
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{document.name}</p>
                  <p className="mt-1 truncate text-sm text-zinc-500">{document.type} · {expiry.label}</p>
                </div>
                <time
                  className={`shrink-0 text-sm font-medium ${expired ? "text-rose-600" : "text-zinc-600"}`}
                  dateTime={document.expiryDate!.toISOString()}
                >
                  {formatDate(document.expiryDate!)}
                </time>
                <span className="text-xl text-zinc-300 transition group-hover:translate-x-1 group-hover:text-zinc-700">→</span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl border border-dashed border-zinc-200 py-10 text-center text-sm text-zinc-400">
          No {title.toLocaleLowerCase()} documents.
        </div>
      )}
    </section>
  );
}

export default async function ExpiringDocumentsPage() {
  const now = new Date();
  const { upcoming, expired } = await getExpiringDocuments(now);

  return (
    <ModuleContent width="standard">
      <ModuleHeader
        backHref="/documents"
        backLabel="Back to documents"
        breadcrumbs={[{ label: "Documents", href: "/documents" }, { label: "Expiring" }]}
        icon={<CalendarDays className="h-6 w-6" />}
        iconClassName="bg-blue-50 text-blue-700"
        title="Expiring documents"
        description="A document appears in Upcoming when its reminder period begins."
      />

      <div className="mt-9 space-y-5">
        <DocumentSection title="Upcoming" documents={upcoming} now={now} />
        <DocumentSection title="Expired" documents={expired} now={now} expired />
      </div>
    </ModuleContent>
  );
}
