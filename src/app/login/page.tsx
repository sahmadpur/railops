import { getLocale, getTranslations } from "next-intl/server";
import { redirect } from "next/navigation";

import LocaleSwitcher from "@/components/LocaleSwitcher";
import { getSession } from "@/lib/session";

import LoginForm from "./LoginForm";

export default async function LoginPage() {
  if (await getSession()) redirect("/dashboard");
  const [t, locale] = await Promise.all([getTranslations(), getLocale()]);

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-[420px]">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="bg-accent grid size-11 place-items-center rounded-xl font-bold text-white">RO</span>
            <div>
              <h1 className="text-xl font-semibold">{t("app.name")}</h1>
              <p className="text-muted text-xs">{t("app.subtitle")}</p>
            </div>
          </div>
          <LocaleSwitcher current={locale} label={t("nav.language")} />
        </div>
        <LoginForm
          labels={{
            title: t("login.title"),
            email: t("login.email"),
            password: t("login.password"),
            submit: t("login.submit"),
            invalid: t("login.invalid"),
            hint: t("login.hint"),
          }}
        />
      </div>
    </main>
  );
}
