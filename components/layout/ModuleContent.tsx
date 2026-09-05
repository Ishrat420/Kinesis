const widths = {
  narrow: "max-w-3xl",
  standard: "max-w-5xl",
  wide: "max-w-7xl",
  full: "max-w-none",
} as const;

export type ModuleContentWidth = keyof typeof widths;

/**
 * Content width for a page inside the application shell.
 *
 * The shell itself lives in app/(app)/layout.tsx; this only decides how wide
 * the page's content is allowed to run, so modules stay consistent instead of
 * each picking their own max width.
 */
export function ModuleContent({
  width = "wide",
  children,
}: {
  width?: ModuleContentWidth;
  children: React.ReactNode;
}) {
  return <div className={widths[width]}>{children}</div>;
}
