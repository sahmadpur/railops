import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { db } from "@/db";
import { users } from "@/db/schema";

const COOKIE = "railops_session";
const MAX_AGE_SECONDS = 60 * 60 * 12; // one shift

export type Session = {
  userId: number;
  email: string;
  fullName: string;
  role: "admin" | "operator";
  stationId: number | null;
};

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error("AUTH_SECRET is not set");
  return new TextEncoder().encode(value);
}

export async function createSessionCookie(session: Session) {
  const token = await new SignJWT({ ...session })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE_SECONDS}s`)
    .sign(secret());

  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: MAX_AGE_SECONDS,
  });
}

export async function destroySessionCookie() {
  (await cookies()).delete(COOKIE);
}

/** Cached per request so nested layouts don't re-verify the token. */
export const getSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      fullName: payload.fullName as string,
      role: payload.role as Session["role"],
      stationId: (payload.stationId ?? null) as number | null,
    };
  } catch {
    return null;
  }
});

export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export async function requireAdmin(): Promise<Session> {
  const session = await requireSession();
  if (session.role !== "admin") redirect("/turnarounds");
  return session;
}

/** Returns the session payload for valid credentials, or null. Deactivated users cannot log in. */
export async function verifyCredentials(email: string, password: string): Promise<Session | null> {
  const bcrypt = (await import("bcryptjs")).default;
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);

  if (!user || !user.isActive) return null;
  if (!(await bcrypt.compare(password, user.passwordHash))) return null;

  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    stationId: user.stationId,
  };
}
