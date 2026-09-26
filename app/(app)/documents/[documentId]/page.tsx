import { notFound } from "next/navigation";
import { getDocument, getDocumentTypes } from "@/lib/data/documents";
import { getObjectEvents } from "@/lib/data/object-event-history";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { DocumentDetailRecord } from "./EditDocumentForm";
import { getCurrentUser, getUserDisplayName } from "@/lib/data/user";
import { getKinesisLinkOptions, getKinesisLinkPreviews, getKinesisLinkRecentEvents } from "@/lib/data/kinesis-links";
import { getKinesisLinks } from "@/lib/data/object-relationships";
import { addKinesisLinkAction, removeKinesisLinkAction, updateKinesisLinkAction } from "@/app/actions";
import { formatDateInput } from "@/lib/dates";

export default async function DocumentDetailPage({ params, searchParams }: { params: Promise<{ documentId: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { documentId } = await params;
  const { edit } = await searchParams;
  const [document, documentTypes, user] = await Promise.all([getDocument(documentId), getDocumentTypes(), getCurrentUser()]);

  // One answer for a missing record across every module -- see app/(app)/not-found.tsx.
  if (!document) notFound();

  // Excludes this document's own object -- linking it to itself is never
  // meaningful, so the picker never offers the choice at all.
  const [linkOptions, history, kinesisLinks] = await Promise.all([
    getKinesisLinkOptions(document.objectId),
    getObjectEvents(document.objectId),
    getKinesisLinks(document.objectId),
  ]);
  // Every object the picker could show, not just ones already linked --
  // choosing a new one in the picker, before saving, should show exactly
  // the card it'll actually render as (KD-042), not the compact fallback
  // until the next reload.
  const previews = await getKinesisLinkPreviews(linkOptions.map((option) => option.objectId));
  // Only the targets actually linked here need a sneak peek, unlike
  // `previews` above which also has to cover the picker's own candidates.
  const recentEvents = await getKinesisLinkRecentEvents(kinesisLinks.map((link) => ({ objectId: link.target.objectId, linkType: link.type })));

  return <ModuleContent><DocumentDetailRecord document={{
    id: document.id, name: document.name, type: document.type, status: document.status, archived: document.archived,
    createdAt: document.createdAt.toISOString(), expiryDate: toDateInput(document.expiryDate), issueDate: toDateInput(document.issueDate),
    documentNumber: document.documentNumber ?? "", country: document.country ?? "", notes: document.notes ?? "", link: document.link ?? "", prompt: document.prompt,
    expiryDateLabel: document.expiryDateLabel, issueDateLabel: document.issueDateLabel, documentNumberLabel: document.documentNumberLabel,
    countryLabel: document.countryLabel, notesLabel: document.notesLabel, linkLabel: document.linkLabel, customFields: document.customFields,
    updatedAt: document.updatedAt.toISOString(),
  }} documentTypes={documentTypes} ownerName={getUserDisplayName(user)} linkOptions={linkOptions} previews={previews} recentEvents={recentEvents} history={history.map((event) => ({ id: event.id, title: event.title, detail: event.detail, occurredAt: event.occurredAt.toISOString() }))} initialEditing={edit === "1"}
    kinesisLinks={kinesisLinks}
    addKinesisLinkAction={addKinesisLinkAction.bind(null, document.objectId)}
    updateKinesisLinkAction={updateKinesisLinkAction.bind(null, document.objectId)}
    removeKinesisLinkAction={removeKinesisLinkAction.bind(null, document.objectId)}
  /></ModuleContent>;
}

function toDateInput(date: Date | null) { return date ? formatDateInput(date) : ""; }
