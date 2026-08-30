import Link from "next/link";

export type Breadcrumb = { label: string; href?: string };

/**
 * Trail showing where a detail page sits inside its module, e.g.
 * `Documents / Passport`. The final crumb is the current page and is never a
 * link.
 */
export function Breadcrumbs({ items }: { items: Breadcrumb[] }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-2 text-sm font-medium text-zinc-400">
        {items.map((item, index) => {
          const last = index === items.length - 1;

          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-2">
              {item.href && !last ? (
                <Link href={item.href} className="transition hover:text-zinc-700">
                  {item.label}
                </Link>
              ) : (
                <span className={last ? "text-zinc-600" : undefined} aria-current={last ? "page" : undefined}>
                  {item.label}
                </span>
              )}

              {!last && <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
