/**
 * Redactie van gevoelige velden voor weergave (diagnosepagina, logs).
 *
 * `PASSKEY` (Ecowitt-stationsleutel) en vergelijkbare velden zijn geen
 * "wachtwoord" in de klassieke zin, maar identificeren wél een specifiek
 * station en horen niet onnodig zichtbaar te zijn op een pagina/log die
 * mogelijk breder gedeeld wordt. De ruwe, ongeredigeerde payload blijft
 * intact in de database (`raw_weather_packets.raw_payload`) — deze functie
 * wordt uitsluitend gebruikt vlak vóór weergave/logging.
 */
import type { RawPayload } from "./types";

const SENSITIVE_KEY_PATTERN =
  /passkey|password|passwd|api[_-]?key|application[_-]?key|secret|token/i;

const REDACTED_PLACEHOLDER = "[verborgen]";

/**
 * Toont alleen de eerste en laatste 2 tekens van een gevoelige waarde, voor
 * herkenbaarheid. Ook gebruikt door `/station` om `stationIdentifier`
 * (de Ecowitt `PASSKEY`) en `macAddress` niet in platte tekst op een
 * publieke pagina te tonen — wie deze waarde kent, kan er (met het juiste
 * ingestie-secret) weerdata namens dit station mee versturen.
 */
export function maskSecretValue(value: string): string {
  if (value.length <= 6) {
    return REDACTED_PLACEHOLDER;
  }
  return `${value.slice(0, 2)}…${value.slice(-2)} ${REDACTED_PLACEHOLDER}`;
}

/**
 * Geeft een kopie van de payload terug waarin gevoelige velden (PASSKEY,
 * wachtwoorden, API-sleutels) vervangen zijn door een geredigeerde waarde.
 * Werkt ook op geneste objecten (bv. de Ecowitt Cloud API-respons).
 */
export function sanitizePayloadForDisplay(payload: unknown): unknown {
  if (Array.isArray(payload)) {
    return payload.map(sanitizePayloadForDisplay);
  }
  if (payload !== null && typeof payload === "object") {
    const entries = Object.entries(payload as Record<string, unknown>).map(
      ([key, value]) => {
        if (SENSITIVE_KEY_PATTERN.test(key)) {
          return [
            key,
            typeof value === "string" ? maskSecretValue(value) : REDACTED_PLACEHOLDER,
          ];
        }
        return [key, sanitizePayloadForDisplay(value)];
      },
    );
    return Object.fromEntries(entries);
  }
  return payload;
}

/** Variant met het specifieke `RawPayload`-type, voor gebruik in de ingestielaag. */
export function sanitizeRawPayload(payload: RawPayload): RawPayload {
  return sanitizePayloadForDisplay(payload) as RawPayload;
}
