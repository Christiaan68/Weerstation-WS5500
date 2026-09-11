/**
 * Fase 5.2 — validatie voor het stationbeheerformulier (`/admin/stations`).
 *
 * Bewust een apart bestand (niet in `src/lib/db/queries.ts`): dit is
 * FORM-/API-invoervalidatie (mag onvertrouwde, door de gebruiker getypte
 * strings ontvangen), los van de al bestaande `NewStationInput`/`StationPatch`
 * types in queries.ts die uitgaan van al genormaliseerde waarden.
 */
import { z } from "zod";

/** Alle door de Node/V8-runtime ondersteunde IANA-tijdzones — geen losse, onvolledige lijst die uit sync kan raken. */
const SUPPORTED_TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

/**
 * Maakt van een weergavenaam een URL-vriendelijke slug: kleine letters,
 * diakritische tekens vervangen door hun basisvorm (bv. "ë" → "e"), niet-
 * alfanumerieke tekens naar een koppelteken, geen dubbele/rand-koppeltekens.
 * Puur functioneel en los getest (zie tests/weather-station-schema.test.ts).
 */
export function slugify(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 140);
}

/** MAC-adres in de gangbare vorm `AA:BB:CC:DD:EE:FF` (hoofdletterongevoelig). */
const MAC_ADDRESS_REGEX = /^[0-9a-fA-F]{2}(:[0-9a-fA-F]{2}){5}$/;

const optionalTrimmed = () =>
  z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().trim().optional(),
  );

/** Basisvelden, gedeeld door het aanmaak- en het bewerkformulier. */
const stationBaseSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(1, "Naam is verplicht.")
    .max(120, "Naam mag maximaal 120 tekens zijn."),
  locationDescription: optionalTrimmed().pipe(
    z.string().max(160, "Locatieomschrijving mag maximaal 160 tekens zijn.").optional(),
  ),
  timezone: z
    .string()
    .trim()
    .min(1, "Tijdzone is verplicht.")
    .refine((value) => SUPPORTED_TIME_ZONES.has(value), {
      message: "Onbekende tijdzone — kies een geldige IANA-tijdzone (bv. Europe/Amsterdam).",
    }),
  macAddress: optionalTrimmed().pipe(
    z
      .string()
      .regex(MAC_ADDRESS_REGEX, "MAC-adres moet de vorm AA:BB:CC:DD:EE:FF hebben.")
      .transform((value) => value.toUpperCase())
      .optional(),
  ),
  /**
   * Fase 6 — eigen Ecowitt-sleutels, alleen nodig als dit station bij een
   * ANDER Ecowitt.net-account hoort dan de rest. Bewust ruim gevalideerd
   * (geen vast formaat): Ecowitt geeft deze sleutels zelf uit en het exacte
   * formaat is geen contract van dit project.
   */
  ecowittApplicationKey: optionalTrimmed().pipe(
    z.string().max(80, "Application Key mag maximaal 80 tekens zijn.").optional(),
  ),
  ecowittApiKey: optionalTrimmed().pipe(
    z.string().max(80, "API Key mag maximaal 80 tekens zijn.").optional(),
  ),
  expectedUploadIntervalSeconds: z.coerce
    .number()
    .int("Interval moet een geheel getal zijn.")
    .min(30, "Interval moet minimaal 30 seconden zijn.")
    .max(3600, "Interval mag maximaal 3600 seconden (1 uur) zijn."),
});

/** Formulier "nieuw station toevoegen" — vereist bovendien een technische identifier. */
export const createStationFormSchema = stationBaseSchema.extend({
  stationIdentifier: z
    .string()
    .trim()
    .min(1, "Identifier (Ecowitt PASSKEY of apparaat-id) is verplicht.")
    .max(120, "Identifier mag maximaal 120 tekens zijn."),
});

/** Formulier "station bewerken" — identifier en MAC mogen ook hier gewijzigd worden, slug niet. */
export const updateStationFormSchema = stationBaseSchema.extend({
  stationIdentifier: z
    .string()
    .trim()
    .min(1, "Identifier (Ecowitt PASSKEY of apparaat-id) is verplicht.")
    .max(120, "Identifier mag maximaal 120 tekens zijn."),
});

export type CreateStationFormInput = z.infer<typeof createStationFormSchema>;
export type UpdateStationFormInput = z.infer<typeof updateStationFormSchema>;

/**
 * Verbindingstest — een MAC-adres, plus (Fase 6) optioneel de EIGEN
 * Ecowitt-sleutels van dit station. Beide leeg = val terug op de gedeelde
 * server-side sleutels (het station hoort dan bij hetzelfde Ecowitt-account
 * als de rest — het gangbare geval).
 */
export const testConnectionSchema = z.object({
  macAddress: z
    .string()
    .trim()
    .regex(MAC_ADDRESS_REGEX, "MAC-adres moet de vorm AA:BB:CC:DD:EE:FF hebben.")
    .transform((value) => value.toUpperCase()),
  ecowittApplicationKey: optionalTrimmed().pipe(
    z.string().max(80, "Application Key mag maximaal 80 tekens zijn.").optional(),
  ),
  ecowittApiKey: optionalTrimmed().pipe(
    z.string().max(80, "API Key mag maximaal 80 tekens zijn.").optional(),
  ),
});

/**
 * Vertaalt een MySQL/TiDB "duplicate entry"-foutmelding naar een begrijpelijke
 * Nederlandse tekst voor het formulier — i.p.v. de rauwe SQL-foutmelding te
 * tonen. Herkent de unieke indexen uit `src/lib/db/schema.ts` (`stations`).
 */
export function describeDuplicateKeyError(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error);
  if (!/duplicate entry|er_dup_entry/i.test(message)) {
    return undefined;
  }
  if (message.includes("stations_slug_unique")) {
    return "Er bestaat al een station met (bijna) deze naam — kies een andere naam.";
  }
  if (message.includes("stations_station_identifier_unique")) {
    return "Deze identifier is al in gebruik bij een ander station.";
  }
  if (message.includes("stations_mac_address_unique")) {
    return "Dit MAC-adres is al gekoppeld aan een ander station.";
  }
  return "Deze waarde is al in gebruik bij een ander station.";
}
