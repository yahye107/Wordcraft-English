import {
  House,
  Compass,
  Search,
  FlaskConical,
  PenLine,
  MessagesSquare,
  BookOpenText,
  Bookmark,
  TrendingUp,
  Settings,
  type LucideIcon,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Shown in the phone bottom bar. */
  primary?: boolean;
};

export const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Home", icon: House, primary: true },
  { href: "/explore", label: "Explore", icon: Compass, primary: true },
  { href: "/search", label: "Search", icon: Search, primary: true },
  { href: "/labs", label: "Labs", icon: FlaskConical },
  { href: "/studio", label: "Studio", icon: PenLine, primary: true },
  { href: "/tutor", label: "Tutor", icon: MessagesSquare },
  { href: "/novel", label: "Novel lab", icon: BookOpenText },
  { href: "/notebook", label: "Notebook", icon: Bookmark, primary: true },
  { href: "/progress", label: "Progress", icon: TrendingUp },
];

export const SETTINGS_ITEM: NavItem = {
  href: "/settings",
  label: "Settings",
  icon: Settings,
};

export function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
