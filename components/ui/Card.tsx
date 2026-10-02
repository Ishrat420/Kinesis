export function Card({
  title,
  children,
  className = "",
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`rounded-3xl border border-zinc-200/80 bg-white p-4 shadow-[0_8px_30px_rgb(0,0,0,0.04)] sm:p-6 ${className}`}
    >
      <h2 className="mb-5 text-lg font-semibold tracking-tight text-zinc-900">
        {title}
      </h2>
      {children}
    </section>
  );
}