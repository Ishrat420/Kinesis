import { notFound } from "next/navigation";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getTemplate, getTemplateFieldSample } from "@/lib/data/templates";
import { getFormatPreferences, getToday } from "@/lib/format/server";
import { TemplateDetailForm } from "./TemplateDetailForm";
import { CloneTemplateButton } from "./CloneTemplateButton";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

export default async function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const [template, sample, { locale, currency }, today] = await Promise.all([getTemplate(templateId), getTemplateFieldSample(templateId), getFormatPreferences(), getToday()]);
  if (!template) notFound();

  return <>
    <ModuleHeader
      backHref="/settings/templates"
      backLabel="Back to templates"
      title={template.name}
      description={`Linked to ${template.linkedModules} module${template.linkedModules === 1 ? "" : "s"} · Used by ${template.usedByObjects} object${template.usedByObjects === 1 ? "" : "s"}`}
      actions={<><CloneTemplateButton templateId={template.id} templateName={template.name} /><DeleteTemplateButton templateId={template.id} templateName={template.name} locked={template.inUse} /></>}
    />

    <div className="mt-8">
      <TemplateDetailForm
        templateId={template.id}
        name={template.name}
        fields={template.fields}
        previewFields={template.previewFields}
        sample={sample}
        locale={locale}
        currency={currency}
        today={today.toISOString()}
        locked={template.inUse}
      />
    </div>
  </>;
}
