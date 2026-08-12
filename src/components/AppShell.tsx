"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

export type NavItem = { href: string; text: string; icon: IconName };

type IconName = keyof typeof ICONS;

/** Stroke icons kept inline — the sidebar needs eight glyphs, not an icon package. */
const ICONS = {
  dashboard: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  turnarounds: "M4 8h11a4 4 0 0 1 0 8H7m0 0 3-3m-3 3 3 3M20 8l-3-3m3 3-3 3",
  journal: "M5 4h11l3 3v13H5zM8 9h8M8 13h8M8 17h5",
  admin: "M12 3 4 6v6c0 4 3.4 7.4 8 9 4.6-1.6 8-5 8-9V6z",
  users: "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M3 20a6 6 0 0 1 12 0M17 20a5 5 0 0 0-3-4.6M16 4.6a3.5 3.5 0 0 1 0 6.8",
  locomotives: "M6 4h12v9H6zM4 13h16l-2 5H6zM8 20h2M14 20h2M9 7h6",
  trainNumbers: "M4 7h16M4 12h16M4 17h9",
  maintenance: "m14.5 5.5 4 4M4 20l4.5-1 9-9a2.1 2.1 0 0 0-3-3l-9 9z",
  reference: "M5 5h6v14H5zM13 5h6v14h-6M8 9h0M16 9h0",
  operations: "M7 4v16M17 4v16M4 8h6M14 16h6",
  audit: "M12 8v4l3 2M21 12a9 9 0 1 1-9-9",
  manual: "M9.6 9.2a2.4 2.4 0 1 1 3.3 2.2c-.6.3-1 .9-1 1.6v.5M12 17h0M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
} as const;

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

export default function AppShell({
  appName,
  menuLabel,
  adminLabel,
  links,
  adminLinks,
  userName,
  userMeta,
  localeSwitcher,
  signOutButton,
  children,
}: {
  appName: string;
  menuLabel: string;
  adminLabel: string;
  links: NavItem[];
  adminLinks: NavItem[];
  userName: string;
  userMeta: string;
  localeSwitcher: React.ReactNode;
  signOutButton: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isCurrent = (href: string) => (pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined);

  return (
    <div className="flex min-h-full">
      {open && (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/30 lg:hidden"
        />
      )}

      <aside
        className={`border-line bg-surface no-print fixed inset-y-0 start-0 z-40 w-[290px] shrink-0 overflow-y-auto border-e transition-transform lg:sticky lg:top-0 lg:h-screen lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex h-[77px] items-center gap-3 px-5">
          <span className="bg-accent grid size-9 place-items-center rounded-lg text-sm font-bold text-white">MS</span>
          <span className="text-lg font-semibold">{appName}</span>
        </div>

        <nav className="space-y-6 px-4 pb-8">
          <div>
            <p className="eyebrow mb-2 px-3">{menuLabel}</p>
            <ul className="space-y-1">
              {links.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={isCurrent(link.href)}
                    onClick={() => setOpen(false)}
                    className="nav-link"
                  >
                    <Icon name={link.icon} />
                    {link.text}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {adminLinks.length > 0 && (
            <div>
              <p className="eyebrow mb-2 px-3">{adminLabel}</p>
              <ul className="space-y-1">
                {adminLinks.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={isCurrent(link.href)}
                      onClick={() => setOpen(false)}
                      className="nav-link"
                    >
                      <Icon name={link.icon} />
                      {link.text}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-line bg-surface no-print sticky top-0 z-20 border-b">
          <div className="flex min-h-[77px] flex-wrap items-center gap-3 px-4 py-3 lg:px-6">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="btn px-2.5 py-2 lg:hidden"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
              </svg>
              <span className="sr-only">{menuLabel}</span>
            </button>

            <div className="ms-auto flex items-center gap-3">
              {localeSwitcher}
              <div className="flex items-center gap-2.5">
                <span className="bg-accent-weak text-accent grid size-9 place-items-center rounded-full text-xs font-semibold">
                  {userName.slice(0, 2).toUpperCase()}
                </span>
                <span className="hidden leading-tight sm:block">
                  <span className="block text-sm font-medium">{userName}</span>
                  <span className="text-muted block text-xs">{userMeta}</span>
                </span>
              </div>
              {signOutButton}
            </div>
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1600px] flex-1 p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
}
