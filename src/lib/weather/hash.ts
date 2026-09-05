/**
 * Deduplicatie van ruwe payloads.
 *
 * Het WS5500/Ecowitt-protocol kan (bij een wankele internetverbinding, of
 * een station dat na een time-out opnieuw dezelfde upload probeert) exact
 * dezelfde payload meerdere keren aanleveren. We herkennen dat aan de hash
 * van de payload zelf — NIET aan het tijdstip alleen, want twee losse,
 * legitieme metingen kunnen in theorie identieke sensorwaarden hebben maar
 * horen bij een ander moment (en dus een andere `dateutc`, die deel uitmaakt
 * van de payload en dus ook van de hash).
 *
 * De hash wordt berekend over een gecanonicaliseerde vorm (sleutels
 * gesorteerd) zodat twee objecten met dezelfde inhoud maar een andere
 * sleutelvolgorde (bv. form-urlencoded vs. JSON) toch dezelfde hash geven.
 */
import { createHash } from "node:crypto";

import type { RawPayload } from "./types";

/** Sorteert alle sleutels (ook geneste objecten) zodat de output deterministisch is. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
    return Object.fromEntries(entries.map(([k, v]) => [k, canonicalize(v)]));
  }
  return value;
}

/** SHA-256 hex-hash van een payload, ongevoelig voor sleutelvolgorde. */
export function hashPayload(payload: RawPayload): string {
  const canonical = JSON.stringify(canonicalize(payload));
  return createHash("sha256").update(canonical).digest("hex");
}
