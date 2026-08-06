import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  const t = await getTranslations();

  const links = [
    { href: "/admin/users", text: t("nav.users") },
    { href: "/admin/locomotives", text: t("nav.locomotives") },
    { href: "/admin/train-numbers", text: t("nav.trainNumbers") },
    { href: "/admin/maintenance", text: t("nav.maintenance") },
    { href: "/admin/reference", text: t("nav.reference") },
    { href: "/admin/operations", text: t("nav.operations") },
    { href: "/admin/audit", text: t("nav.audit") },
  ];

  return (
    <div className="space-y-4">
      <nav className="border-line bg-surface no-print flex flex-wrap gap-3 rounded border px-3 py-2 text-xs">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="hover:text-accent hover:underline">
            {l.text}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
