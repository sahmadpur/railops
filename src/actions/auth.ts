"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { LOCALE_COOKIE, isLocale } from "@/i18n/config";
import { createSessionCookie, destroySessionCookie, verifyCredentials } from "@/lib/session";

export async function signIn(_prev: { error?: string } | undefined, formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const session = await verifyCredentials(email, password);
  if (!session) return { error: "invalid" };

  await createSessionCookie(session);
  redirect("/dashboard");
}

export async function signOut() {
  await destroySessionCookie();
  redirect("/login");
}

export async function setLocale(formData: FormData) {
  const locale = String(formData.get("locale") ?? "");
  if (!isLocale(locale)) return;

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
  revalidatePath("/", "layout");
}
