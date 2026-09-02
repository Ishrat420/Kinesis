import { getDocument, getDocumentTypes } from "@/lib/data/documents";
import { getActivityForHref } from "@/lib/data/activity";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { DocumentDetailRecord } from "./EditDocumentForm";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getKinesisLinkOptions } from "@/lib/data/kinesis-links";
import { formatDateInput } from "@/lib/dates";

export default async function DocumentDetailPage({ params }: { params: Promise<{ documentId: string }> }) {
  const { documentId } = await params;
  const [document, documentTypes, user, linkOptions] = await Promise.all([getDocument(documentId), getDocumentTypes(), getCurrentUser(), getKinesisLinkOptions()]);

  if (!document) return <ModuleContent><ModuleHeader backHref="/documents" backLabel="Back to documents" title="Document not found" description="This document may have been deleted." /></ModuleContent>;

  const history = await getActivityForHref(`/documents/${document.id}`);

  return <ModuleContent><DocumentDetailRecord document={{
    id: document.id, name: document.name, type: document.type, status: document.status,
    createdAt: document.createdAt.toISOString(), expiryDate: toDateInput(document.expiryDate), issueDate: toDateInput(document.issueDate),
    documentNumber: document.documentNumber ?? "", country: document.country ?? "", notes: document.notes ?? "", link: document.link ?? "", prompt: document.prompt,
    expiryDateLabel: document.expiryDateLabel, issueDateLabel: document.issueDateLabel, documentNumberLabel: document.documentNumberLabel,
    countryLabel: document.countryLabel, notesLabel: document.notesLabel, linkLabel: document.linkLabel, customFields: document.customFields,
  }} documentTypes={documentTypes} ownerName={getUserDisplayName(user)} linkOptions={linkOptions} history={history.map((event) => ({ id: event.id, action: event.action, createdAt: event.createdAt.toISOString() }))} /></ModuleContent>;
}

function toDateInput(date: Date | null) { return date ? formatDateInput(date) : ""; }
