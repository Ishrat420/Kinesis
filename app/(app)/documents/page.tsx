import {
  getDocuments,
  getDocumentSummary,
  getDocumentTypes,
} from "@/lib/data/documents";
import { FileText, Plus, ShieldCheck } from "lucide-react";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { UploadDocumentButton } from "./UploadDocumentButton";
import { ManualDocumentButton } from "./ManualDocumentButton";
import { DocumentsList } from "./DocumentsList";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
import { getFormatPreferences } from "@/lib/format/server";
import { readCaptureParams } from "@/lib/capture/params";


export default async function DocumentsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [capture, documents, documentTypes, documentSummary, linkOptions, { locale }] = await Promise.all([
    searchParams.then(readCaptureParams),
    getDocuments(),
    getDocumentTypes(),
    getDocumentSummary(),
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
            <ManualDocumentButton documentTypes={documentTypes} linkOptions={linkOptions} capture={capture} />
            <UploadDocumentButton />
          </>
        }
      />

      {/* Three across at every width: stacked on a phone, they were a
          screen of scrolling before the list. */}
      <div className="mt-6 sm:mt-8 grid grid-cols-3 gap-3 sm:gap-4">
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

      <DocumentsList documents={documents} locale={locale} />
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
    <section className="rounded-2xl border border-zinc-200/80 bg-white p-3 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:rounded-3xl sm:p-5">
      <div className="flex items-center gap-3">
        <div className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-blue-50 sm:flex">
          <Icon className="h-[18px] w-[18px] text-zinc-700" />
        </div>

        <p className="text-xs font-semibold text-zinc-700 sm:text-sm">{title}</p>
      </div>

      <p className="mt-2 text-2xl font-semibold leading-none tracking-tight sm:mt-6 sm:text-[38px]">
        {value}
      </p>
    </section>
  );
}
