import { BackLink } from "@/components/navigation/BackLink";
import { Breadcrumbs, type Breadcrumb } from "@/components/navigation/Breadcrumbs";

/**
 * The standard page header for every module.
 *
 * Top-level module pages rely on the sidebar to say where they are, so they
 * pass a title and description only. Detail pages add breadcrumbs and a back
 * link to the module they belong to.
 *
 * The title steps down a size below `sm`: at 38px a two-word module name eats
 * most of a phone screen, and the actions below it wrap rather than shrink.
 */
export function ModuleHeader({
  title,
  description,
  eyebrow,
  breadcrumbs,
  backHref,
  backLabel,
  icon,
  iconClassName = "bg-zinc-100 text-zinc-700",
  iconStyle,
  actions,
  className = "",
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  eyebrow?: string;
  breadcrumbs?: Breadcrumb[];
  backHref?: string;
  backLabel?: string;
  icon?: React.ReactNode;
  iconClassName?: string;
  iconStyle?: React.CSSProperties;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={className}>
      {backHref && <BackLink href={backHref} className="mb-5">{backLabel ?? "Back"}</BackLink>}

      {breadcrumbs?.length ? <div className="mb-3"><Breadcrumbs items={breadcrumbs} /></div> : null}

      {/*
        The actions share the title's row whenever they fit, and wrap to just
        under the title when they don't, with the description always beneath
        both. On a phone that keeps the button off a row of its own; on a
        wider screen it is the same title-and-actions row as before.
      */}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3 sm:items-start sm:gap-5">
        <div className="flex min-w-0 items-center gap-4 sm:items-start">
          {icon && (
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`} style={iconStyle}>
              {icon}
            </span>
          )}

          <div className="min-w-0">
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</p>
            )}

            <h1 className={`${eyebrow ? "mt-2 " : ""}text-[30px] font-semibold leading-tight tracking-tight sm:text-[38px] sm:leading-none`}>
              {title}
            </h1>
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      {/* Smaller and tighter on a phone, where it otherwise ran to three
          lines. From sm up it sits where it always did: under the title, past
          the icon, 12px below the title itself. The row above is as tall as
          the 48px icon or buttons when there are any, 10px taller than the
          title alone, so the gap shrinks by that much to make up for it. */}
      {description && (
        <p className={`mt-2 max-w-2xl text-sm leading-6 text-zinc-500 sm:text-base sm:leading-7 ${icon || actions ? "sm:mt-0.5" : "sm:mt-3"} ${icon ? "sm:ml-16" : ""}`}>{description}</p>
      )}
    </header>
  );
}
