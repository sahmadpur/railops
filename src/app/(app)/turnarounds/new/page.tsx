import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";

import { ROUTES } from "@/db/schema";
import { getStations } from "@/lib/catalogue";
import { routeLabel, todayIso } from "@/lib/format";
import { requireSession } from "@/lib/session";
import { openingRule } from "@/lib/turnaround-rules";

import NewTurnaroundForm from "./NewTurnaroundForm";

export default async function NewTurnaroundPage() {
  const session = await requireSession();
  const [t, locale, stations] = await Promise.all([getTranslations(), getLocale(), getStations()]);

  const stationCode = stations.find((s) => s.id === session.stationId)?.code ?? null;
  const opening = openingRule(session.role, stationCode);
  const routeOption = (route: (typeof ROUTES)[number]) => ({ value: route, text: routeLabel(route, stations, locale) });

  return (
    <div className="max-w-md space-y-4">
      <Link href="/turnarounds" className="text-muted text-xs hover:underline">
        ← {t("turnarounds.title")}
      </Link>
      <h1 className="page-title">{t("turnarounds.createTitle")}</h1>

      {opening.allowed ? (
        <>
          {opening.route && (
            <p className="text-muted text-sm">
              {t("turnarounds.route")}: <span className="font-medium">{routeOption(opening.route).text}</span>
            </p>
          )}
          <NewTurnaroundForm
            today={todayIso()}
            routes={opening.route ? null : ROUTES.map(routeOption)}
            labels={{
              route: t("turnarounds.route"),
              trainNumber: t("common.trainNumber"),
              cycleDate: t("turnarounds.cycleDate"),
              submit: t("common.create"),
              errors: {
                forbidden: t("errors.forbidden"),
                generic: t("errors.generic"),
              },
            }}
          />
        </>
      ) : (
        <p className="card card-pad text-muted text-sm">{t("turnarounds.cannotOpenHere")}</p>
      )}
    </div>
  );
}
