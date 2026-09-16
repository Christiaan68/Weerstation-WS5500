/**
 * Cookie-wrapper rond `src/lib/auth/session.ts`, voor gebruik in Server
 * Components/Server Actions (niet in `src/proxy.ts` — die leest de cookie
 * rechtstreeks via `NextRequest.cookies`, zie daar).
 */
import "server-only";
import { cookies } from "next/headers";

import { getServerEnv } from "@/lib/env";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session";

/** Zet de sessiecookie na een geslaagde login — zie `src/app/login/actions.ts`. */
export async function createSessionCookie(): Promise<void> {
  const { SITE_AUTH_SESSION_SECRET } = getServerEnv();
  const token = createSessionToken(SITE_AUTH_SESSION_SECRET);
  const cookieStore = await cookies();

  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    // Alleen over HTTPS versturen in productie — op `localhost` (http)
    // tijdens lokaal ontwikkelen zou een `Secure`-cookie anders nooit
    // teruggestuurd worden.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/",
  });
}

/** Verwijdert de sessiecookie — zie `logout()` in `src/app/login/actions.ts`. */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

/**
 * Voor gebruik in Server Components/Server Actions die ONAFHANKELIJK van
 * `src/proxy.ts` nog eens willen controleren of er een geldige sessie is
 * (defense in depth — zie de uitleg bovenaan `src/app/admin/stations/
 * actions.ts`). `src/proxy.ts` zelf gebruikt dit NIET (die leest de cookie
 * rechtstreeks van `NextRequest`, zonder `next/headers`).
 */
export async function hasValidSession(): Promise<boolean> {
  const { SITE_AUTH_SESSION_SECRET } = getServerEnv();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  return verifySessionToken(token, SITE_AUTH_SESSION_SECRET);
}
