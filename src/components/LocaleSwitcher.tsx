"use client";

import { useTransition } from "react";

import { setLocale } from "@/actions/auth";
import { localeNames, locales } from "@/i18n/config";

/** Switches on selection — no confirm button to press. */
export default function LocaleSwitcher({ current, label }: { current: string; label: string }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label={label}
      defaultValue={current}
      disabled={pending}
      onChange={(event) => {
        const formData = new FormData();
        formData.set("locale", event.target.value);
        startTransition(() => setLocale(formData));
      }}
      className="field w-auto py-1 text-xs"
    >
      {locales.map((locale) => (
        <option key={locale} value={locale}>
          {localeNames[locale]}
        </option>
      ))}
    </select>
  );
}
