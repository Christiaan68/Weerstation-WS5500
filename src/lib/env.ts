/**
 * Gevalideerde environment variables.
 *
 * - `serverEnv`  → uitsluitend server-side gebruiken (route handlers, server
 *   components, scripts). Bevat geheimen zoals DATABASE_URL en mag NOOIT
 *   worden geïmporteerd in een bestand met `'use client'`.
 * - `publicEnv`  → veilig voor client én server. Bevat alleen variabelen die
 *   met `NEXT_PUBLIC_` beginnen en dus toch al in de browserbundle terecht
 *   komen.
 *
 * We valideren met Zod zodat een ontbrekende of foutieve variabele direct
 * bij opstarten (of bij de eerste server-aanroep) een duidelijke foutmelding
 * geeft, in plaats van een onduidelijke crash dieper in de applicatie.
 */
import { z } from "zod";

/**
 * Een optionele string-variabele. Een lege string (`FOO=` in .env, zoals in
 * .env.example) wordt behandeld als "niet ingesteld" — dat voorkomt dat een
 * bewust leeg gelaten, nog niet gebruikte variabele (bv. de Ecowitt-
 * credentials in Fase 1) de validatie laat falen.
 */
const optionalString = () =>
  z.preprocess(
    (value) => (value === "" ? undefined : value),
    z.string().min(1).optional(),
  );

const serverSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL ontbreekt. Zie .env.example en docs/TIDB_SETUP.md."),
  WEATHER_INGEST_SECRET: optionalString(),
  STATION_DIAGNOSTICS_SECRET: optionalString(),
  ECOWITT_APPLICATION_KEY: optionalString(),
  ECOWITT_API_KEY: optionalString(),
  ECOWITT_DEVICE_MAC: optionalString(),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const publicSchema = z.object({
  NEXT_PUBLIC_STATION_NAME: z.string().min(1).default("Alecto WS5500"),
  NEXT_PUBLIC_TIMEZONE: z.string().min(1).default("Europe/Amsterdam"),
  NEXT_PUBLIC_DEMO_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
});

export type ServerEnv = z.infer<typeof serverSchema>;
export type PublicEnv = z.infer<typeof publicSchema>;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
}

let cachedServerEnv: ServerEnv | undefined;

/**
 * Valideert en retourneert de server-only environment variables.
 * Gooit een duidelijke fout als er iets ontbreekt of ongeldig is.
 * Wordt lazy + gecachet uitgevoerd zodat build-time (waarbij nog geen
 * secrets beschikbaar hoeven te zijn, bv. tijdens `next build` linting)
 * niet onnodig faalt, terwijl runtime-gebruik wel altijd gevalideerd wordt.
 */
export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error(
      "getServerEnv() mag alleen server-side aangeroepen worden, nooit vanuit client-code.",
    );
  }

  if (cachedServerEnv) {
    return cachedServerEnv;
  }

  const parsed = serverSchema.safeParse(process.env);

  if (!parsed.success) {
    const details = formatZodError(parsed.error);
    throw new Error(
      `Ongeldige of ontbrekende server environment variables:\n${details}\n\n` +
        "Controleer .env.local (lokaal) of de Vercel project settings (productie/preview).",
    );
  }

  cachedServerEnv = parsed.data;
  return cachedServerEnv;
}

let cachedPublicEnv: PublicEnv | undefined;

function parsePublicEnv(): PublicEnv {
  if (cachedPublicEnv) {
    return cachedPublicEnv;
  }

  const raw = {
    NEXT_PUBLIC_STATION_NAME: process.env.NEXT_PUBLIC_STATION_NAME,
    NEXT_PUBLIC_TIMEZONE: process.env.NEXT_PUBLIC_TIMEZONE,
    NEXT_PUBLIC_DEMO_MODE: process.env.NEXT_PUBLIC_DEMO_MODE,
  };

  const parsed = publicSchema.safeParse(raw);

  if (!parsed.success) {
    const details = formatZodError(parsed.error);
    throw new Error(`Ongeldige NEXT_PUBLIC_* environment variables:\n${details}`);
  }

  cachedPublicEnv = parsed.data;
  return cachedPublicEnv;
}

/** Client- en server-veilige publieke configuratie. */
export const publicEnv: PublicEnv = parsePublicEnv();
