"use server";

/**
 * Server Actions voor `/admin/stations` (Fase 5.2 — stationbeheer, sinds
 * Fase 7 beveiligd met de site-brede login i.p.v. een eigen `?key=`).
 *
 * BEVEILIGING: render-time gating (de pagina alleen tonen aan een
 * ingelogde bezoeker) is GEEN beveiligingsgrens op zich — een Server
 * Action is een eigen, rechtstreeks aanroepbaar POST-endpoint (zie Next.js'
 * eigen documentatie, "Data Security"-richtlijn, en de uitleg in
 * `src/proxy.ts`). Daarom controleert ELKE actie hieronder de sessie
 * opnieuw, onafhankelijk van de pagina die hem aanroept.
 *
 * Elke actie retourneert een resultaat-object i.p.v. te gooien: rauwe
 * fout-/stacktrace-informatie hoort nooit naar de client te lekken, en de
 * UI (zie station-form.tsx) toont het resultaat inline zonder paginareload.
 */
import { revalidatePath } from "next/cache";

import { hasValidSession } from "@/lib/auth/session-cookie";
import {
  createStation,
  getStationById,
  getStations,
  setDefaultStation,
  updateStation,
} from "@/lib/db/queries";
import { EcowittCloudProvider } from "@/lib/weather/providers/ecowitt-cloud";
import {
  createStationFormSchema,
  describeDuplicateKeyError,
  slugify,
  testConnectionSchema,
  updateStationFormSchema,
} from "@/lib/weather/station-schema";
import { fahrenheitToCelsius } from "@/lib/weather/units";

export interface ActionResult {
  ok: boolean;
  error?: string;
  fieldErrors?: Record<string, string>;
}

function unauthorized(): ActionResult {
  return { ok: false, error: "Niet (meer) ingelogd — log opnieuw in." };
}

/** Genereert een unieke slug op basis van de weergavenaam (probeert `-2`, `-3`, ... bij botsing). */
async function generateUniqueSlug(displayName: string): Promise<string> {
  const base = slugify(displayName) || "station";
  const existing = new Set((await getStations({ includeInactive: true })).map((s) => s.slug));
  if (!existing.has(base)) return base;
  for (let suffix = 2; suffix < 1000; suffix++) {
    const candidate = `${base}-${suffix}`;
    if (!existing.has(candidate)) return candidate;
  }
  // Praktisch onbereikbaar (999 stations met dezelfde naam), maar TypeScript
  // wil een gegarandeerde return-waarde.
  return `${base}-${Date.now()}`;
}

export async function createStationAction(
  input: Record<string, string>,
): Promise<ActionResult> {
  if (!(await hasValidSession())) return unauthorized();

  const parsed = createStationFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "algemeen";
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { ok: false, error: "Controleer de gemarkeerde velden.", fieldErrors };
  }

  const slug = await generateUniqueSlug(parsed.data.displayName);

  try {
    await createStation({
      displayName: parsed.data.displayName,
      slug,
      stationIdentifier: parsed.data.stationIdentifier,
      macAddress: parsed.data.macAddress ?? null,
      ecowittApplicationKey: parsed.data.ecowittApplicationKey ?? null,
      ecowittApiKey: parsed.data.ecowittApiKey ?? null,
      timezone: parsed.data.timezone,
      locationDescription: parsed.data.locationDescription ?? null,
      expectedUploadIntervalSeconds: parsed.data.expectedUploadIntervalSeconds,
      isActive: true,
    });
  } catch (error) {
    const friendly = describeDuplicateKeyError(error);
    return {
      ok: false,
      error: friendly ?? "Aanmaken van het station is mislukt — probeer het opnieuw.",
    };
  }

  revalidatePath("/admin/stations");
  return { ok: true };
}

export async function updateStationAction(
  id: number,
  input: Record<string, string>,
): Promise<ActionResult> {
  if (!(await hasValidSession())) return unauthorized();

  const existing = await getStationById(id);
  if (!existing) {
    return { ok: false, error: "Station niet gevonden." };
  }

  const parsed = updateStationFormSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path.join(".") || "algemeen";
      if (!fieldErrors[field]) fieldErrors[field] = issue.message;
    }
    return { ok: false, error: "Controleer de gemarkeerde velden.", fieldErrors };
  }

  try {
    await updateStation(id, {
      displayName: parsed.data.displayName,
      stationIdentifier: parsed.data.stationIdentifier,
      macAddress: parsed.data.macAddress ?? null,
      ecowittApplicationKey: parsed.data.ecowittApplicationKey ?? null,
      ecowittApiKey: parsed.data.ecowittApiKey ?? null,
      timezone: parsed.data.timezone,
      locationDescription: parsed.data.locationDescription ?? null,
      expectedUploadIntervalSeconds: parsed.data.expectedUploadIntervalSeconds,
    });
  } catch (error) {
    const friendly = describeDuplicateKeyError(error);
    return {
      ok: false,
      error: friendly ?? "Bijwerken van het station is mislukt — probeer het opnieuw.",
    };
  }

  revalidatePath("/admin/stations");
  return { ok: true };
}

export async function setDefaultStationAction(id: number): Promise<ActionResult> {
  if (!(await hasValidSession())) return unauthorized();

  try {
    await setDefaultStation(id);
  } catch {
    return { ok: false, error: "Instellen als standaardstation is mislukt." };
  }

  revalidatePath("/admin/stations");
  return { ok: true };
}

export async function toggleActiveAction(
  id: number,
  nextActive: boolean,
): Promise<ActionResult> {
  if (!(await hasValidSession())) return unauthorized();

  const existing = await getStationById(id);
  if (!existing) {
    return { ok: false, error: "Station niet gevonden." };
  }
  if (existing.isDefault && !nextActive) {
    return {
      ok: false,
      error:
        "Het standaardstation kan niet gedeactiveerd worden — stel eerst een ander station als standaard in.",
    };
  }

  try {
    await updateStation(id, { isActive: nextActive });
  } catch {
    return { ok: false, error: "Wijzigen van de status is mislukt." };
  }

  revalidatePath("/admin/stations");
  return { ok: true };
}

export interface ConnectionTestResult {
  ok: boolean;
  error?: string;
  preview?: {
    temperatureOutdoorC: number | null;
    measuredAt: string | null;
  };
}

/**
 * Test rechtstreeks tegen de Ecowitt Cloud API of een MAC-adres bruikbare
 * data oplevert — ZONDER iets op te slaan (geen `ingestWeatherPayload()`-
 * aanroep, zie ecowitt-cloud.ts). Zo kan de gebruiker vóór het opslaan van
 * een (nieuw) station bevestigen dat het de juiste is.
 *
 * Fase 6: `ecowittApplicationKey`/`ecowittApiKey` zijn optioneel — alleen
 * nodig als dit station bij een ANDER Ecowitt-account hoort. Deze test
 * draait vaak vóórdat het station is opgeslagen (bij het aanmaken van een
 * nieuw station), dus de sleutels komen rechtstreeks uit het formulier, niet
 * uit de database.
 */
export async function testEcowittConnectionAction(
  macAddressInput: string,
  ecowittApplicationKeyInput?: string,
  ecowittApiKeyInput?: string,
): Promise<ConnectionTestResult> {
  if (!(await hasValidSession())) return unauthorized();

  const parsed = testConnectionSchema.safeParse({
    macAddress: macAddressInput,
    ecowittApplicationKey: ecowittApplicationKeyInput,
    ecowittApiKey: ecowittApiKeyInput,
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ongeldig MAC-adres." };
  }

  const provider = new EcowittCloudProvider();
  const result = await provider.fetchCurrent(
    parsed.data.macAddress,
    parsed.data.ecowittApplicationKey,
    parsed.data.ecowittApiKey,
  );

  if (!result.ok) {
    return { ok: false, error: result.error };
  }

  const tempfRaw = result.rawPayload.tempf;
  const tempf = tempfRaw !== undefined ? Number(tempfRaw) : NaN;
  const dateutcRaw = result.rawPayload.dateutc;
  const measuredAtSeconds = dateutcRaw !== undefined ? Number(dateutcRaw) : NaN;

  return {
    ok: true,
    preview: {
      temperatureOutdoorC: Number.isFinite(tempf)
        ? Math.round(fahrenheitToCelsius(tempf) * 10) / 10
        : null,
      measuredAt: Number.isFinite(measuredAtSeconds)
        ? new Date(measuredAtSeconds * 1000).toISOString()
        : null,
    },
  };
}
