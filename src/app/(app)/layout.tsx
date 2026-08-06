import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { signOut } from "@/actions/auth";
import LocaleSwitcher from "@/components/LocaleSwitcher";
import { db } from "@/db";
import { stations } from "@/db/schema";
import { label } from "@/lib/format";
import { requireSession } from "@/lib/session";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const session = await requireSession();
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  const station = session.stationId
    ? (await db.select().from(stations).where(eq(stations.id, session.stationId)).limit(1))[0]
    : null;

  const links = [
    { href: "/dashboard", text: t("nav.dashboard") },
    { href: "/turnarounds", text: t("nav.turnarounds") },
    { href: "/reports/journal", text: t("nav.journal") },
    ...(session.role === "admin" ? [{ href: "/admin/users", text: t("nav.admin") }] : []),
  ];

  return (
    <>
      <header className="border-line bg-surface no-print border-b">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-4 px-4 py-2">
          <Link href="/dashboard" className="font-semibold">
            {t("app.name")}
          </Link>

          <nav className="flex flex-wrap gap-3 text-sm">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="hover:text-accent hover:underline">
                {l.text}
              </Link>
            ))}
          </nav>

          <div className="ms-auto flex items-center gap-3 text-xs">
            <span className="text-muted">
              {session.fullName}
              {station ? ` · ${label(station.name, locale)}` : ` · ${t("admin.users.admin")}`}
            </span>
            <LocaleSwitcher current={locale} label={t("nav.language")} />
            <form action={signOut}>
              <button type="submit" className="btn px-2 py-1 text-xs">
                {t("nav.signOut")}
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1600px] flex-1 p-4">{children}</main>
    </>
  );
}
