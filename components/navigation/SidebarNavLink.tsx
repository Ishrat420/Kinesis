"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isRouteActive } from "@/lib/navigation/active-route";
import { navItemClassName } from "./nav-item";

/**
 * Sidebar entry that highlights itself when the current route belongs to it.
 *
 * The icon arrives as a rendered element so the server component that owns the
 * navigation list keeps deciding which icon each entry uses.
 */
export function SidebarNavLink({
  href,
  label,
  icon,
}: {
  href: string;
  label: string;
  icon: React.ReactNode;
}) {
  const pathname = usePathname();
  const active = isRouteActive(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={navItemClassName(active)}
    >
      {icon}
      <span className="min-w-0 truncate font-medium">{label}</span>
    </Link>
  );
}
