import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveLocomotives } from "@/lib/catalogue";
import { todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";

import NewTurnaroundForm from "./NewTurnaroundForm";

export default async function NewTurnaroundPage() {
  await requireSession();
  const [t, locomotiveRows] = await Promise.all([getTranslations(), getActiveLocomotives()]);

  return (
    <div className="max-w-md space-y-3">
      <Link href="/turnarounds" className="text-muted text-xs hover:underline">
        ← {t("turnarounds.title")}
      </Link>
      <h1 className="text-lg font-semibold">{t("turnarounds.createTitle")}</h1>

      <NewTurnaroundForm
        locomotives={locomotiveRows.map((l) => ({ id: l.id, text: `${l.number} · ${l.owner}` }))}
        today={todayIso()}
        labels={{
          locomotive: t("common.locomotive"),
          cycleDate: t("turnarounds.cycleDate"),
          submit: t("common.create"),
          alreadyExists: t("turnarounds.alreadyExists"),
          generic: t("errors.generic"),
        }}
      />
    </div>
  );
}
