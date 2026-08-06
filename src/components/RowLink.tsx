"use client";

import { useRouter } from "next/navigation";

/**
 * A table row that opens its record on double-click. The row's own link (usually the id cell)
 * stays in place — it is what keyboard and open-in-new-tab still rely on.
 */
export default function RowLink({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tr onDoubleClick={() => router.push(href)} className="cursor-pointer">
      {children}
    </tr>
  );
}
