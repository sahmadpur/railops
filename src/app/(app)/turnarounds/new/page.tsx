import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { getActiveTrainNumbers, getStations } from "@/lib/catalogue";
import { todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { openingRule } from "@/lib/turnaround-rules";

import NewTurnaroundForm from "./NewTurnaroundForm";

export default async function NewTurnaroundPage() {
  const session = await requireSession();
  const [t, trainRows, stations] = await Promise.all([getTranslations(), getActiveTrainNumbers(), getStations()]);

  const stationCode = stations.find((s) => s.id === session.stationId)?.code ?? null;
  const opening = openingRule(session.role, stationCode);
  // Böyük Kəsik opens even trains, Tbilisi odd ones; admins see every parity.
  const trains = opening.allowed
    ? trainRows.filter((n) => !opening.parity || n.parity === opening.parity)
    : [];

  return (
    <div className="max-w-md space-y-4">
      <Link href="/turnarounds" className="text-muted text-xs hover:underline">
        ← {t("turnarounds.title")}
      </Link>
      <h1 className="page-title">{t("turnarounds.createTitle")}</h1>

      {opening.allowed ? (
        <NewTurnaroundForm
          trains={trains.map((n) => ({ id: n.id, text: `${n.number} · ${n.country}` }))}
          today={todayIso()}
          labels={{
            trainNumber: t("common.trainNumber"),
            cycleDate: t("turnarounds.cycleDate"),
            submit: t("common.create"),
            alreadyExists: t("turnarounds.alreadyExists"),
            generic: t("errors.generic"),
          }}
        />
      ) : (
        <p className="card card-pad text-muted text-sm">{t("turnarounds.cannotOpenHere")}</p>
      )}
    </div>
  );
}
