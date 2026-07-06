import { getDocument } from "@/lib/data/documents";
import {
  Bell,
  Calendar,
  Clock,
  FileText,
  Link2,
  NotebookText,
  ShieldCheck,
  User,
} from "lucide-react";

const relationships = [
  { icon: User, label: "Owner", value: "Ishrat" },
  { icon: Bell, label: "Reminder", value: "Renew 6 months before expiry" },
  { icon: Link2, label: "Linked goal", value: "Japan Trip" },
];

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
  const document = await getDocument(documentId);

  if (!document) {
    return (
      <main className="min-h-screen bg-[#f7f8fb] px-10 py-8 text-zinc-950">
        <h1 className="text-[38px] font-semibold">Document not found</h1>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#f7f8fb] px-10 py-8 text-zinc-950">
      <div className="max-w-7xl">
        <div className="mb-6">
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

            <span className="rounded-full bg-amber-50 px-4 py-2 text-sm font-semibold text-amber-700">
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
            <h2 className="text-lg font-semibold">Information</h2>

            <div className="mt-5 space-y-4">
              <InfoRow icon={Calendar} label="Expiry date" value={formatDate(document.expiryDate)} />
              <InfoRow icon={Clock} label="Issue date" value={formatDate(document.issueDate)} />
              <InfoRow icon={User} label="Owner" value={document.owner ?? "Not set"} />
              <InfoRow icon={ShieldCheck} label="Document number" value={document.documentNumber ?? "Not set"} />
              <InfoRow icon={FileText} label="Country" value={document.country ?? "Not set"} />
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold">Relationships</h2>

            <div className="mt-5 space-y-4">
              {relationships.map((item) => (
                <InfoRow
                  key={item.label}
                  icon={item.icon}
                  label={item.label}
                  value={item.value}
                />
              ))}
            </div>
          </section>

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

          <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold">Notes</h2>

            <div className="mt-5 rounded-2xl bg-zinc-50 p-4 text-sm leading-6 text-zinc-500">
              <NotebookText className="mb-3 h-[18px] w-[18px]" />
              Keep renewal notes, application details, or related context here.
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl p-2">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-50">
        <Icon className="h-[18px] w-[18px] text-zinc-600" />
      </div>

      <div>
        <p className="text-sm text-zinc-400">{label}</p>
        <p className="font-medium text-zinc-800">{value}</p>
      </div>
    </div>
  );
}

function formatDate(date: Date | null) {
  if (!date) return "Not set";

  return date.toLocaleDateString("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}