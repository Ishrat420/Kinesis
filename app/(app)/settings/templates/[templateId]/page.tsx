import { notFound } from "next/navigation";
import { ModuleContent } from "@/components/layout/ModuleContent";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getTemplate } from "@/lib/data/templates";
import { TemplateDetailForm } from "./TemplateDetailForm";
import { CloneTemplateButton } from "./CloneTemplateButton";
import { DeleteTemplateButton } from "./DeleteTemplateButton";

export default async function TemplateDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = await params;
  const template = await getTemplate(templateId);
  if (!template) notFound();

  return <ModuleContent width="standard">
    <ModuleHeader
      backHref="/settings/templates"
      backLabel="Back to templates"
      title={template.name}
      description={`Linked to ${template.linkedModules} module${template.linkedModules === 1 ? "" : "s"} · Used by ${template.usedByObjects} object${template.usedByObjects === 1 ? "" : "s"}`}
      actions={<><CloneTemplateButton templateId={template.id} templateName={template.name} /><DeleteTemplateButton templateId={template.id} templateName={template.name} locked={template.inUse} /></>}
    />

    <div className="mt-8">
      <TemplateDetailForm templateId={template.id} name={template.name} fields={template.fields} locked={template.inUse} />
    </div>
  </ModuleContent>;
}
