/**
 * Gedeelde query-validatie en periode-resolutie voor de Fase 4-exports
 * (`/api/weather/export/csv`, `/api/weather/export/json`) — alle
 * queryparameters gaan door Zod (§50-expliciete eis), en de presets worden
 * herleid tot exacte UTC-grenzen via de al bestaande, DST-bewuste
 * kalenderhelpers uit `timezone.ts` (Fase 3) — geen nieuwe datumlogica.
 */
import { z } from "zod";

import {
  getLocalDateKey,
  getLocalDayBoundsUtc,
  getLocalMonthBoundsUtc,
  getLocalYearBoundsUtc,
  getLocalYearMonth,
} from "@/lib/weather/timezone";
import { EXPORT_METRIC_KEYS, isExportMetricKey } from "@/lib/weather/export/columns";

export const EXPORT_PRESETS = [
  "vandaag",
  "gisteren",
  "laatste-7-dagen",
  "laatste-30-dagen",
  "huidige-maand",
  "huidig-jaar",
  "aangepast",
] as const;
export type ExportPreset = (typeof EXPORT_PRESETS)[number];

const dateOnlyPattern = /^\d{4}-\d{2}-\d{2}$/;

/** Accepteert "YYYY-MM-DD" of een volledige ISO-datetime (met of zonder tijdzone-aanduiding). */
const dateLikeSchema = z.string().refine(
  (v) => dateOnlyPattern.test(v) || !Number.isNaN(Date.parse(v)),
  { message: "Ongeldige datum — gebruik YYYY-MM-DD of een ISO-datetime." },
);

export const exportQuerySchema = z.object({
  preset: z.enum(EXPORT_PRESETS).optional(),
  from: dateLikeSchema.optional(),
  to: dateLikeSchema.optional(),
  metrics: z.string().optional(),
  source: z.string().max(40).optional(),
  timezone: z.enum(["local", "utc"]).default("local"),
  delimiter: z.enum(["comma", "semicolon"]).default("comma"),
  format: z.enum(["json", "ndjson"]).default("json"),
});

export type ExportQueryInput = z.input<typeof exportQuerySchema>;

export interface ResolvedExportRange {
  fromUtc: Date;
  toUtc: Date;
  preset: ExportPreset;
}

/** "YYYY-MM-DD" (lokaal-middernacht) of een volledige ISO-datetime → UTC-instant, rekening houdend met `timezone`. */
function resolveDateLikeToUtc(
  value: string,
  timezone: "local" | "utc",
  boundary: "start" | "end",
): Date {
  if (dateOnlyPattern.test(value)) {
    if (timezone === "utc") {
      const [y, m, d] = value.split("-").map(Number);
      const base = Date.UTC(y!, m! - 1, d!);
      return new Date(boundary === "start" ? base : base + 86_400_000);
    }
    const bounds = getLocalDayBoundsUtc(value);
    return boundary === "start" ? bounds.startUtc : bounds.endUtc;
  }
  // Volledige ISO-datetime met eigen tijdzone-aanduiding — die respecteren we altijd letterlijk.
  return new Date(value);
}

/**
 * Herleidt de queryparameters naar een concreet UTC-tijdvak
 * (`fromUtc` inclusief, `toUtc` exclusief). Gooit een leesbare `Error` bij
 * `preset: "aangepast"` (of geen preset) zonder bruikbare `from`/`to`.
 */
export function resolveExportRange(
  query: z.infer<typeof exportQuerySchema>,
  now: Date = new Date(),
): ResolvedExportRange {
  const preset = query.preset ?? (query.from || query.to ? "aangepast" : "laatste-7-dagen");

  switch (preset) {
    case "vandaag": {
      const { startUtc, endUtc } = getLocalDayBoundsUtc(getLocalDateKey(now));
      return { fromUtc: startUtc, toUtc: endUtc, preset };
    }
    case "gisteren": {
      const todayKey = getLocalDateKey(now);
      const { startUtc: todayStart } = getLocalDayBoundsUtc(todayKey);
      const yesterday = new Date(todayStart.getTime() - 12 * 3600 * 1000); // ruim binnen de vorige lokale dag
      const yesterdayKey = getLocalDateKey(yesterday);
      const { startUtc, endUtc } = getLocalDayBoundsUtc(yesterdayKey);
      return { fromUtc: startUtc, toUtc: endUtc, preset };
    }
    case "laatste-7-dagen":
    case "laatste-30-dagen": {
      const days = preset === "laatste-7-dagen" ? 7 : 30;
      const todayKey = getLocalDateKey(now);
      const { endUtc: todayEnd } = getLocalDayBoundsUtc(todayKey);
      const startAnchor = new Date(todayEnd.getTime() - (days - 1) * 86_400_000 - 12 * 3600 * 1000);
      const { startUtc } = getLocalDayBoundsUtc(getLocalDateKey(startAnchor));
      return { fromUtc: startUtc, toUtc: todayEnd, preset };
    }
    case "huidige-maand": {
      const { year, month } = getLocalYearMonth(now);
      const { startUtc, endUtc } = getLocalMonthBoundsUtc(year, month);
      return { fromUtc: startUtc, toUtc: endUtc, preset };
    }
    case "huidig-jaar": {
      const { year } = getLocalYearMonth(now);
      const { startUtc, endUtc } = getLocalYearBoundsUtc(year);
      return { fromUtc: startUtc, toUtc: endUtc, preset };
    }
    case "aangepast": {
      if (!query.from || !query.to) {
        throw new Error(
          "Voor preset 'aangepast' (of zonder preset met alleen 'from'/'to') zijn zowel 'from' als 'to' verplicht.",
        );
      }
      const fromUtc = resolveDateLikeToUtc(query.from, query.timezone, "start");
      const toUtc = resolveDateLikeToUtc(query.to, query.timezone, "end");
      if (!(fromUtc.getTime() < toUtc.getTime())) {
        throw new Error("'from' moet vóór 'to' liggen.");
      }
      return { fromUtc, toUtc, preset };
    }
  }
}

/** Zet de kommagescheiden `metrics`-parameter om naar een gevalideerde lijst kolomsleutels — leeg/afwezig ⇒ ALLE kolommen. */
export function resolveExportMetricKeys(metricsParam: string | undefined): string[] {
  if (!metricsParam || metricsParam.trim() === "") return [...EXPORT_METRIC_KEYS];
  const keys = metricsParam
    .split(",")
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const invalid = keys.filter((k) => !isExportMetricKey(k));
  if (invalid.length > 0) {
    throw new Error(
      `Onbekende metric(s): ${invalid.join(", ")}. Geldige waarden: ${EXPORT_METRIC_KEYS.join(", ")}.`,
    );
  }
  return keys;
}
