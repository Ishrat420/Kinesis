"use client";

import {
  documentDetails,
  documentRelationships,
  documentTimeline,
} from "@/app/lib/mock/documents";
import { useParams } from "next/navigation";
import { useState } from "react";
import {
  Bell,
  Calendar,
  Check,
  Clock,
  FileText,
  Link2,
  NotebookText,
  Pencil,
  ShieldCheck,
  User,
} from "lucide-react";

const relationshipIcons = {
  owner: User,
  reminder: Bell,
  goal: Link2,
  vehicle: FileText,
};

export default function DocumentDetailPage() {
  const params = useParams();
  const documentId = params.documentId as keyof typeof documentDetails;

  const document = documentDetails[documentId];
  const relationships = documentRelationships[documentId] ?? [];
  const timeline = documentTimeline[documentId] ?? [];

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
              <InfoRow icon={Calendar} label="Expiry date" value={document.expiryDate} />
              <InfoRow icon={Clock} label="Issue date" value={document.issueDate} />
              <InfoRow icon={User} label="Owner" value={document.owner} />
              <InfoRow icon={ShieldCheck} label="Document number" value={document.documentNumber} />
              <InfoRow icon={FileText} label="Country" value={document.country} />
            </div>
          </section>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <section className="rounded-3xl border border-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)]">
            <h2 className="text-lg font-semibold">Relationships</h2>

            <div className="mt-5 space-y-4">
              {relationships.map((item) => {
                const Icon =
                  relationshipIcons[item.type as keyof typeof relationshipIcons] ?? Link2;

                return (
                  <InfoRow
                    key={item.label}
                    icon={Icon}
                    label={item.label}
                    value={item.value}
                  />
                );
              })}
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
  const [isEditing, setIsEditing] = useState(false);
  const [currentValue, setCurrentValue] = useState(value);
  const [draftValue, setDraftValue] = useState(value);
  const [saved, setSaved] = useState(false);

  function saveValue() {
    setCurrentValue(draftValue);
    setIsEditing(false);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 900);
  }

  function cancelEdit() {
    setDraftValue(currentValue);
    setIsEditing(false);
  }

  return (
    <div className="group flex items-center gap-3 rounded-2xl p-2 transition hover:bg-zinc-50">
      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-zinc-50">
        <Icon className="h-[18px] w-[18px] text-zinc-600" />
      </div>

      <div className="flex-1">
        <p className="text-sm text-zinc-400">{label}</p>

        {isEditing ? (
          <input
            autoFocus
            value={draftValue}
            onChange={(event) => setDraftValue(event.target.value)}
            onBlur={saveValue}
            onKeyDown={(event) => {
              if (event.key === "Enter") saveValue();
              if (event.key === "Escape") {
                event.preventDefault();
                cancelEdit();
              }
            }}
            className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 font-medium text-zinc-800 outline-none focus:border-zinc-400"
          />
        ) : (
          <button
            type="button"
            onClick={() => setIsEditing(true)}
            className="mt-1 flex w-full items-center justify-between rounded-xl text-left font-medium text-zinc-800"
          >
            <span>{currentValue}</span>

            <span className="flex items-center gap-2">
              {saved ? (
                <span className="flex h-5 w-5 animate-pulse items-center justify-center rounded-full bg-emerald-500">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </span>
              ) : (
                <Pencil className="h-4 w-4 text-zinc-300 opacity-0 transition group-hover:opacity-100" />
              )}
            </span>
          </button>
        )}
      </div>
    </div>
  );
}