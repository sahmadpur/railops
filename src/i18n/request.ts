import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, defaultLocale, isLocale } from "./config";

// Cookie-based locale: this is an internal tool with no public URLs to share,
// so no /[locale] path segment.
// ponytail: switch to next-intl routing if per-language URLs are ever needed.
export default getRequestConfig(async () => {
  const cookie = (await cookies()).get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookie) ? cookie : defaultLocale;

  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
