import { notInArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { db } from "@/db";
import { turnarounds } from "@/db/schema";
import { getActiveTrainNumbers, getStations } from "@/lib/catalogue";
import { todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { FINISHED_STATUSES, openingRule } from "@/lib/turnaround-rules";

import NewTurnaroundForm from "./NewTurnaroundForm";

export default async function NewTurnaroundPage() {
  const session = await requireSession();
  const [t, trainRows, stations, running] = await Promise.all([
    getTranslations(),
    getActiveTrainNumbers(),
    getStations(),
    db
      .select({ trainNumberId: turnarounds.trainNumberId })
      .from(turnarounds)
      .where(notInArray(turnarounds.statusCode, [...FINISHED_STATUSES])),
  ]);

  const stationCode = stations.find((s) => s.id === session.stationId)?.code ?? null;
  const opening = openingRule(session.role, stationCode);
  // Böyük Kəsik opens even trains, Tbilisi odd ones; admins see every parity. A train already
  // on an unfinished turnaround is not offered at all — the action rejects it either way.
  const busy = new Set(running.map((r) => r.trainNumberId));
  const trains = opening.allowed
    ? trainRows.filter((n) => (!opening.parity || n.parity === opening.parity) && !busy.has(n.id))
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
            search: t("common.search"),
            noTrainMatch: t("turnarounds.noTrainMatch"),
            alreadyExists: t("turnarounds.alreadyExists"),
            trainBusy: t("turnarounds.trainBusy"),
            generic: t("errors.generic"),
          }}
        />
      ) : (
        <p className="card card-pad text-muted text-sm">{t("turnarounds.cannotOpenHere")}</p>
      )}
    </div>
  );
}
