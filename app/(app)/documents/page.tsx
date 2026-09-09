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
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
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
