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
      <div className="w-full max-w-sm">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h1 className="text-xl font-semibold">{t("app.name")}</h1>
            <p className="text-muted text-xs">{t("app.subtitle")}</p>
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
