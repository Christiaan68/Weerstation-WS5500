/**
 * Sessietoken voor de site-brede login (Fase 7 — vervangt de losse
 * `?key=`-sleutels van de diagnosepagina's en het beheerscherm uit Fase
 * 2/5.2). Zie `src/proxy.ts` voor waar dit op elk verzoek gecontroleerd
 * wordt, en `src/lib/auth/session-cookie.ts` voor de cookie-wrapper die dit
 * bestand gebruikt in Server Components/Actions.
 *
 * Bewust GEEN externe sessie-/JWT-bibliotheek (zoals `jose`, door Next.js'
 * eigen documentatie gesuggereerd): met één vast account (gebruikersnaam +
 * wachtwoord uit environment variables, geen gebruikersdatabase) is een
 * simpele, zelf te doorzien HMAC-ondertekende waarde voldoende — dezelfde
 * aanpak (Node's ingebouwde `crypto`, timing-safe vergelijken) als
 * `secretMatches()` in `@/lib/weather/secret`, die dit project al gebruikt
 * voor de ingestie-/diagnose-sleutels.
 *
 * De sessiewaarde bevat NOOIT het wachtwoord of de gebruikersnaam, alleen
 * een vervaltijdstempel — puur "is dit een door ons uitgegeven, nog geldig
 * token", niet "wie is dit". Dat is voldoende voor een site met één
 * account.
 *
 * Werkt zowel in `src/proxy.ts` (Next.js 16's Proxy draait standaard op de
 * Node.js-runtime, zie `node_modules/next/dist/docs/01-app/03-api-reference/
 * 03-file-conventions/proxy.md` §Runtime) als in gewone server-code — dit
 * bestand heeft zelf geen Next.js-specifieke imports (`next/headers` etc.
 * zitten in `session-cookie.ts`), zodat het overal herbruikbaar blijft.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE_NAME = "ws5500_session";

/**
 * 30 dagen — lang genoeg om op een persoonlijk toestel niet steeds opnieuw
 * te hoeven inloggen, kort genoeg om een verloren/gedeeld apparaat niet
 * voor onbepaalde tijd toegang te geven.
 */
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

interface SessionPayload {
  /** Vervaltijdstempel in milliseconden sinds epoch (`Date.now()`-stijl). */
  exp: number;
}

function base64UrlEncode(input: string): string {
  return Buffer.from(input, "utf8").toString("base64url");
}

function base64UrlDecode(input: string): string | undefined {
  try {
    return Buffer.from(input, "base64url").toString("utf8");
  } catch {
    return undefined;
  }
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

/**
 * Bouwt een nieuwe, ondertekende sessiewaarde die vanaf nu
 * `SESSION_MAX_AGE_SECONDS` geldig is.
 */
export function createSessionToken(secret: string): string {
  const payload: SessionPayload = { exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

/**
 * Controleert of `token` een geldige, niet-verlopen, niet-gemanipuleerde
 * sessiewaarde is (ondertekend met `secret`). Geeft bij twijfel altijd
 * `false` terug — nooit gooien, dit wordt op elk verzoek aangeroepen.
 */
export function verifySessionToken(
  token: string | undefined,
  secret: string,
): boolean {
  if (!token) return false;

  const separatorIndex = token.indexOf(".");
  if (separatorIndex === -1) return false;

  const encodedPayload = token.slice(0, separatorIndex);
  const signature = token.slice(separatorIndex + 1);
  const expectedSignature = sign(encodedPayload, secret);

  // Nooit met `===`/`!==` op de handtekening vergelijken — zie
  // `secretMatches()` voor dezelfde reden (timing attack). Een
  // lengteverschil is zelf geen geheime informatie, dus veilig om vooraf
  // te controleren (`timingSafeEqual` vereist gelijke lengtes).
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!timingSafeEqual(signatureBuffer, expectedBuffer)) return false;

  const decodedPayload = base64UrlDecode(encodedPayload);
  if (!decodedPayload) return false;

  try {
    const parsed = JSON.parse(decodedPayload) as Partial<SessionPayload>;
    return typeof parsed.exp === "number" && parsed.exp > Date.now();
  } catch {
    return false;
  }
}
