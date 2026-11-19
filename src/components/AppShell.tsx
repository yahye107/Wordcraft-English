"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { NAV_ITEMS, SETTINGS_ITEM, isActive, type NavItem } from "./nav-items";

function NavLink({ item, pathname }: { item: NavItem; pathname: string }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      className="navlink"
      aria-current={isActive(pathname, item.href) ? "page" : undefined}
    >
      <Icon size={20} aria-hidden="true" />
      {item.label}
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMenuOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const bottom = NAV_ITEMS.filter((i) => i.primary);

  return (
    <div className="shell">
      <aside className="rail">
        <Link href="/" className="brand" aria-label="Wordcraft home">
          <span className="hl">Word</span>craft
        </Link>
        <nav className="nav" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink key={item.href} item={item} pathname={pathname} />
          ))}
          <span className="nav-spacer" />
          <NavLink item={SETTINGS_ITEM} pathname={pathname} />
        </nav>
      </aside>

      <header className="topbar">
        <Link href="/" className="brand" aria-label="Wordcraft home">
          <span className="hl">Word</span>craft
        </Link>
        <button
          type="button"
          className="iconbtn"
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
          onClick={() => setMenuOpen((o) => !o)}
        >
          {menuOpen ? <X size={22} aria-hidden="true" /> : <Menu size={22} aria-hidden="true" />}
        </button>
      </header>

      <nav
        id="mobile-menu"
        className="mobile-menu"
        data-open={menuOpen}
        aria-label="All sections"
      >
        {[...NAV_ITEMS, SETTINGS_ITEM].map((item) => (
          <NavLink key={item.href} item={item} pathname={pathname} />
        ))}
      </nav>

      <main className="main" id="main">
        <div className="page">{children}</div>
      </main>

      <nav className="bottomnav" aria-label="Quick">
        {bottom.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={isActive(pathname, item.href) ? "page" : undefined}
            >
              <Icon size={22} aria-hidden="true" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
