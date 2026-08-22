import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getStations } from "@/lib/catalogue";
import { todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { openingRule } from "@/lib/turnaround-rules";

import NewTurnaroundForm from "./NewTurnaroundForm";

export default async function NewTurnaroundPage() {
  const session = await requireSession();
  const [t, stations] = await Promise.all([getTranslations(), getStations()]);

  const stationCode = stations.find((s) => s.id === session.stationId)?.code ?? null;
  const opening = openingRule(session.role, stationCode);

  return (
    <div className="max-w-md space-y-4">
      <Link href="/turnarounds" className="text-muted text-xs hover:underline">
        ← {t("turnarounds.title")}
      </Link>
      <h1 className="page-title">{t("turnarounds.createTitle")}</h1>

      {opening.allowed ? (
        <NewTurnaroundForm
          today={todayIso()}
          labels={{
            trainNumber: t("common.trainNumber"),
            cycleDate: t("turnarounds.cycleDate"),
            submit: t("common.create"),
            errors: {
              wrong_parity: t("errors.wrong_parity"),
              forbidden: t("errors.forbidden"),
              generic: t("errors.generic"),
            },
          }}
        />
      ) : (
        <p className="card card-pad text-muted text-sm">{t("turnarounds.cannotOpenHere")}</p>
      )}
    </div>
  );
}
