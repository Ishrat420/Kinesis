import {
  getDocuments,
  getDocumentSummary,
  getDocumentTypes,
} from "@/lib/data/documents";
import Link from "next/link";
import { FileText, Plus, Search, ShieldCheck } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { UploadDocumentButton } from "./UploadDocumentButton";
import { ManualDocumentButton } from "./ManualDocumentButton";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
import { formatDate } from "@/lib/dates";
import { getFormatPreferences } from "@/lib/format/server";
import { readCaptureParams } from "@/lib/capture/params";


export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [capture, documents, documentTypes, documentSummary, user, linkOptions, { locale }] = await Promise.all([
    searchParams.then(readCaptureParams),
    getDocuments(),
    getDocumentTypes(),
    getDocumentSummary(),
    getCurrentUser(),
    getKinesisLinkOptions(),
    getFormatPreferences(),
  ]);

  return (
    <ModuleContent>
      <ModuleHeader
        title="Documents"
        description="Store, track, and connect important documents."
        actions={
          <>
            <ManualDocumentButton documentTypes={documentTypes} ownerName={getUserDisplayName(user)} linkOptions={linkOptions} capture={capture} />
            <UploadDocumentButton />
          </>
        }
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <StatCard
          icon={FileText}
          title="Tracked documents"
          value={documentSummary.tracked}
        />
        <StatCard
          icon={ShieldCheck}
          title="Active documents"
          value={documentSummary.active}
        />
        <StatCard
          icon={Plus}
          title="Expiring soon"
          value={documentSummary.expiringSoon}
        />
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
                {document.expiryDate ? formatDate(document.expiryDate, locale) : "No expiry"}
              </p>

              <span className="w-fit rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium">
                {document.status}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </ModuleContent>
  );
}

function StatCard({
  icon: Icon,
  title,
  value,
}: {
  icon: React.ElementType;
  title: string;
  value: number;
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
