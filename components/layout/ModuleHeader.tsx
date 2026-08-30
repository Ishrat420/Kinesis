import { BackLink } from "@/components/navigation/BackLink";
import { Breadcrumbs, type Breadcrumb } from "@/components/navigation/Breadcrumbs";

/**
 * The standard page header for every module.
 *
 * Top-level module pages rely on the sidebar to say where they are, so they
 * pass a title and description only. Detail pages add breadcrumbs and a back
 * link to the module they belong to.
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

      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 items-start gap-4">
          {icon && (
            <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${iconClassName}`} style={iconStyle}>
              {icon}
            </span>
          )}

          <div className="min-w-0">
            {eyebrow && (
              <p className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-400">{eyebrow}</p>
            )}

            <h1 className={`${eyebrow ? "mt-2 " : ""}text-[38px] font-semibold leading-none tracking-tight`}>
              {title}
            </h1>

            {description && (
              <p className="mt-3 max-w-2xl text-base leading-7 text-zinc-500">{description}</p>
            )}
          </div>
        </div>

        {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </header>
  );
}
