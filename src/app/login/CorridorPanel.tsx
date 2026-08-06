import { getTranslations } from "next-intl/server";

/** The corridor every turnaround runs. Codes and countries match the seeded stations;
 *  the names live here rather than in a query so signing in never depends on the database. */
const STOPS = [
  { code: "BK", country: "AZ", nameKey: "login.stops.bk" },
  { code: "GRD", country: "GE", nameKey: "login.stops.grd" },
  { code: "TBS", country: "GE", nameKey: "login.stops.tbs" },
] as const;

export default async function CorridorPanel() {
  const t = await getTranslations();

  return (
    <div className="corridor">
      <p className="eyebrow">{t("login.corridor")}</p>
      <div className="corridor-track">
        <ol className="corridor-stops">
          {STOPS.map((stop, index) => (
            <li key={stop.code}>
              {index === 1 && <p className="corridor-frontier">{t("login.border")}</p>}
              <div className="corridor-stop" style={{ animationDelay: `${0.2 + index * 0.14}s` }}>
                <span className="corridor-node" aria-hidden />
                <div>
                  <p className="corridor-code">{stop.code}</p>
                  <p className="corridor-name">{t(stop.nameKey)}</p>
                </div>
                <span className="corridor-country">{stop.country}</span>
              </div>
            </li>
          ))}
        </ol>
        <span className="corridor-return" aria-hidden />
      </div>
      <p className="corridor-legend">{t("dashboard.timeline.returnLeg")}</p>
    </div>
  );
}
