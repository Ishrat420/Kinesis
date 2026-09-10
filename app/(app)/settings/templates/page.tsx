import Link from "next/link";
import { Box, ChevronRight, LayoutGrid, LayoutTemplate, Plus } from "lucide-react";
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
            className="grid min-w-0 grid-cols-[44px_minmax(0,1fr)_24px] items-center gap-3 rounded-2xl border border-zinc-200/80 bg-white p-4 transition hover:-translate-y-0.5 hover:bg-zinc-50 hover:shadow-md sm:grid-cols-[44px_minmax(0,1fr)_auto_24px] sm:gap-4"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-700"><LayoutTemplate className="h-5 w-5" /></span>
            <div className="min-w-0">
              <h3 className="break-words font-semibold">{template.name}</h3>
              <p className="mt-0.5 break-words text-sm text-zinc-500">{template.fieldCount} field{template.fieldCount === 1 ? "" : "s"}</p>
            </div>
            <span className="hidden shrink-0 items-center gap-2.5 text-sm font-medium text-zinc-500 sm:flex">
              <span className="flex items-center gap-1.5"><LayoutGrid className="h-4 w-4" />{template.linkedModules} module{template.linkedModules === 1 ? "" : "s"}</span>
              <span className="h-4 w-px bg-zinc-200" />
              <span className="flex items-center gap-1.5"><Box className="h-4 w-4" />{template.usedByObjects} object{template.usedByObjects === 1 ? "" : "s"}</span>
            </span>
            <ChevronRight className="h-5 w-5 text-zinc-300" />
          </Link>
        ))}
      </div>
    )}
  </>;
}
