import Link from "next/link";
import { ChevronRight, LayoutTemplate, Plus } from "lucide-react";
import { ModuleHeader } from "@/components/layout/ModuleHeader";
import { getTemplates } from "@/lib/data/templates";
import { createTemplateAction } from "./actions";

export default async function TemplatesPage() {
  const templates = await getTemplates();

  return <>
    <ModuleHeader
      title="Templates"
      description="Reusable field structures a module can start new objects from."
      actions={<form action={createTemplateAction}><button className="inline-flex h-11 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-black"><Plus className="h-4 w-4" /> New template</button></form>}
    />

    {!templates.length ? (
      <div className="mt-10 rounded-[28px] border border-dashed border-zinc-300 bg-white px-6 py-16 text-center">
        <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><LayoutTemplate className="h-7 w-7" /></span>
        <h2 className="mt-5 text-xl font-semibold">No templates yet.</h2>
        <p className="mt-2 text-zinc-500">Create one to give a module a starting shape.</p>
      </div>
    ) : (
      <div className="mt-8 space-y-3">
        {templates.map((template) => (
          <Link
            key={template.id}
            href={`/settings/templates/${template.id}`}
            className="grid grid-cols-[44px_minmax(0,1fr)_auto_24px] items-center gap-4 rounded-2xl border border-zinc-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><LayoutTemplate className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="truncate font-semibold">{template.name}</h3>
              <p className="mt-0.5 truncate text-sm text-zinc-500">{template.fieldCount} field{template.fieldCount === 1 ? "" : "s"}</p>
            </div>
            <span className="hidden shrink-0 rounded-full bg-zinc-100 px-3 py-1 text-xs font-medium text-zinc-500 sm:inline">
              Linked to {template.linkedModules} module{template.linkedModules === 1 ? "" : "s"} · Used by {template.usedByObjects} object{template.usedByObjects === 1 ? "" : "s"}
            </span>
            <ChevronRight className="h-5 w-5 text-zinc-300" />
          </Link>
        ))}
      </div>
    )}
  </>;
}
