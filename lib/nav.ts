import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  Tags,
  Banknote,
  Clock,
  UserCog,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

export const mainNavItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/clanovi", label: "Članovi", icon: Users },
  { href: "/cene", label: "Cene", icon: Tags },
  { href: "/pazar", label: "Pazar", icon: Banknote },
];

export const adminNavItems: NavItem[] = [
  { href: "/smene", label: "Smene", icon: Clock },
  { href: "/nalozi", label: "Nalozi", icon: UserCog },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/clanovi": "Članovi",
  "/cene": "Cene",
  "/pazar": "Pazar",
  "/smene": "Smene",
  "/nalozi": "Nalozi",
};

/** Returns whether a nav item should be marked active for the current path. */
export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") {
    return pathname === "/dashboard" || pathname === "/";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Resolves the page title for the slim top header from the current pathname. */
export function getPageTitle(pathname: string): string {
  const exact = pageTitles[pathname];
  if (exact) return exact;

  for (const [path, title] of Object.entries(pageTitles)) {
    if (path !== "/dashboard" && pathname.startsWith(`${path}/`)) {
      return title;
    }
  }

  return "Teretana";
}
