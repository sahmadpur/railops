import { requireAdmin } from "@/lib/session";

/** The admin section lives in the sidebar now; this layout only guards the role. */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  await requireAdmin();
  return children;
}
