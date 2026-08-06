import { eq } from "drizzle-orm";
import { getLocale, getTranslations } from "next-intl/server";

import { signOut } from "@/actions/auth";
import AppShell, { type NavItem } from "@/components/AppShell";
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

  // Operators work the turnaround interface and nothing else.
  const links: NavItem[] =
    session.role === "admin"
      ? [
          { href: "/dashboard", text: t("nav.dashboard"), icon: "dashboard" },
          { href: "/turnarounds", text: t("nav.turnarounds"), icon: "turnarounds" },
          { href: "/reports/journal", text: t("nav.journal"), icon: "journal" },
        ]
      : [{ href: "/turnarounds", text: t("nav.turnarounds"), icon: "turnarounds" }];

  const adminLinks: NavItem[] =
    session.role === "admin"
      ? [
          { href: "/admin/users", text: t("nav.users"), icon: "users" },
          { href: "/admin/locomotives", text: t("nav.locomotives"), icon: "locomotives" },
          { href: "/admin/train-numbers", text: t("nav.trainNumbers"), icon: "trainNumbers" },
          { href: "/admin/maintenance", text: t("nav.maintenance"), icon: "maintenance" },
          { href: "/admin/reference", text: t("nav.reference"), icon: "reference" },
          { href: "/admin/operations", text: t("nav.operations"), icon: "operations" },
          { href: "/admin/audit", text: t("nav.audit"), icon: "audit" },
        ]
      : [];

  return (
    <AppShell
      appName={t("app.name")}
      menuLabel={t("nav.menu")}
      adminLabel={t("nav.admin")}
      links={links}
      adminLinks={adminLinks}
      userName={session.fullName}
      userMeta={station ? label(station.name, locale) : t("admin.users.admin")}
      localeSwitcher={<LocaleSwitcher current={locale} label={t("nav.language")} />}
      signOutButton={
        <form action={signOut}>
          <button type="submit" className="btn px-3 py-2 text-xs">
            {t("nav.signOut")}
          </button>
        </form>
      }
    >
      {children}
    </AppShell>
  );
}
