/**
 * Cookie-wrapper rond `src/lib/auth/session.ts`, voor gebruik in Server
 * Components/Server Actions (niet in `src/proxy.ts` — die leest de cookie
 * rechtstreeks via `NextRequest.cookies`, zie daar).
 */
import "server-only";
import { cookies } from "next/headers";

import { BASE_PATH } from "@/lib/base-path";
import { getServerEnv } from "@/lib/env";

import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifySessionToken,
} from "./session";

/**
 * De cookie hoort alleen bij deze app. Draait de app onder een basePath (bv.
 * `/weerstation`, zie next.config.ts), dan is dat ook het cookiepad, zodat hij
 * niet naar de rest van het domein gestuurd wordt. Zonder basePath: "/".
 */
const SESSION_COOKIE_PATH = BASE_PATH || "/";

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
    path: SESSION_COOKIE_PATH,
  });
}

/** Verwijdert de sessiecookie — zie `logout()` in `src/app/login/actions.ts`. */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  // Een cookie met een eigen pad verwijder je alleen door hetzelfde pad mee te geven.
  cookieStore.delete({ name: SESSION_COOKIE_NAME, path: SESSION_COOKIE_PATH });
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
