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
      className={`rounded-3xl border border-zinc-200/80 border border-zinc-200/80-zinc-200/80 bg-white p-6 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ${className}`}
    >
      <h2 className="mb-5 text-lg font-semibold tracking-tight text-zinc-900">
        {title}
      </h2>
      {children}
    </section>
  );
}