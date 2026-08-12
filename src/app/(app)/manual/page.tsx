import { getLocale, getMessages, getTranslations } from "next-intl/server";

import { requireSession } from "@/lib/session";

/**
 * The user manual. Text lives under `manual` in messages/{locale}.json; the figures are real
 * screenshots of this app, one set per language, re-shot by scripts/manual-shots.mjs.
 */
const OPERATOR_SECTIONS = [
  { id: "signIn", shot: "login" },
  { id: "list", shot: "turnarounds" },
  { id: "open", shot: "new-turnaround" },
  { id: "record", shot: "turnaround-detail" },
  { id: "close", shot: null },
];

const ADMIN_SECTIONS = [
  { id: "dashboard", shot: "dashboard" },
  { id: "journal", shot: "journal" },
  { id: "users", shot: "admin-users" },
  { id: "fleet", shot: "admin-locomotives" },
  { id: "maintenance", shot: "admin-maintenance" },
  { id: "operations", shot: "admin-operations" },
  { id: "audit", shot: "admin-audit" },
];

type ManualSection = { title: string; body: string; steps: string[] };

export default async function ManualPage() {
  const session = await requireSession();
  const [t, locale, messages] = await Promise.all([getTranslations("manual"), getLocale(), getMessages()]);

  // The step lists are arrays, which the message formatter does not hand out — read them raw.
  const sections = (messages as unknown as { manual: { sections: Record<string, ManualSection> } }).manual.sections;

  const render = ({ id, shot }: { id: string; shot: string | null }) => {
    const section = sections[id];
    return (
      <section key={id} className="card card-pad space-y-3">
        <h2 className="card-title">{section.title}</h2>
        <p className="text-muted text-sm">{section.body}</p>
        <ol className="ms-5 list-decimal space-y-1.5 text-sm">
          {section.steps.map((step, index) => (
            <li key={index}>{step}</li>
          ))}
        </ol>
        {shot && (
          /* eslint-disable-next-line @next/next/no-img-element -- static figures of varying height */
          <img
            src={`/manual/${shot}.${locale}.webp`}
            alt={section.title}
            loading="lazy"
            className="border-line w-full rounded-lg border"
          />
        )}
      </section>
    );
  };

  return (
    <div className="max-w-[900px] space-y-8">
      <div>
        <h1 className="page-title">{t("title")}</h1>
        <p className="text-muted text-sm">{t("intro")}</p>
      </div>

      <div className="space-y-4">
        <p className="eyebrow">{t("operator")}</p>
        {OPERATOR_SECTIONS.map(render)}
      </div>

      {session.role === "admin" && (
        <div className="space-y-4">
          <p className="eyebrow">{t("admin")}</p>
          {ADMIN_SECTIONS.map(render)}
        </div>
      )}
    </div>
  );
}
