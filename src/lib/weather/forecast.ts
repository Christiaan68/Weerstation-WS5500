/**
 * 5-daagse weersverwachting voor het dashboard, via Open-Meteo
 * (https://open-meteo.com — gratis voor niet-commercieel gebruik, geen API-
 * sleutel nodig, data onder CC BY 4.0: de bronvermelding staat in
 * `forecast-card.tsx`).
 *
 * Dit bestand bevat bewust alleen pure functies + één `fetch`-aanroep, zodat
 * het zonder netwerk te testen is (zie tests/weather-forecast.test.ts).
 */

export interface ForecastDay {
  /** Lokale kalenderdag (YYYY-MM-DD) in de tijdzone van het station. */
  date: string;
  /** WMO-weercode (zie `describeWeatherCode`). */
  weatherCode: number;
  maxC: number | null;
  minC: number | null;
}

export type ForecastIcon =
  | "sun"
  | "cloud-sun"
  | "cloud"
  | "fog"
  | "drizzle"
  | "rain"
  | "snow"
  | "lightning";

export interface WeatherCodeInfo {
  label: string;
  icon: ForecastIcon;
}

/** Standaardlocatie (De Bilt, KNMI) voor een station zonder ingestelde coördinaten. */
export const DEFAULT_FORECAST_LOCATION = {
  name: "De Bilt",
  latitude: 52.1,
  longitude: 5.18,
} as const;

export const FORECAST_DAYS = 5;

/**
 * Nederlandse omschrijving + icoon bij een WMO-weercode, zoals Open-Meteo die
 * levert (https://open-meteo.com/en/docs — "WMO Weather interpretation
 * codes"). Onbekende codes vallen terug op "Wisselend bewolkt".
 */
export function describeWeatherCode(code: number): WeatherCodeInfo {
  switch (code) {
    case 0:
      return { label: "Zonnig", icon: "sun" };
    case 1:
      return { label: "Overwegend zonnig", icon: "sun" };
    case 2:
      return { label: "Half bewolkt", icon: "cloud-sun" };
    case 3:
      return { label: "Bewolkt", icon: "cloud" };
    case 45:
    case 48:
      return { label: "Mist", icon: "fog" };
    case 51:
    case 53:
    case 55:
      return { label: "Motregen", icon: "drizzle" };
    case 56:
    case 57:
      return { label: "Ijzel", icon: "drizzle" };
    case 61:
      return { label: "Lichte regen", icon: "rain" };
    case 63:
      return { label: "Regen", icon: "rain" };
    case 65:
      return { label: "Zware regen", icon: "rain" };
    case 66:
    case 67:
      return { label: "Ijsregen", icon: "rain" };
    case 71:
    case 73:
    case 75:
    case 77:
      return { label: "Sneeuw", icon: "snow" };
    case 80:
    case 81:
    case 82:
      return { label: "Regenbuien", icon: "rain" };
    case 85:
    case 86:
      return { label: "Sneeuwbuien", icon: "snow" };
    case 95:
      return { label: "Onweer", icon: "lightning" };
    case 96:
    case 99:
      return { label: "Onweer met hagel", icon: "lightning" };
    default:
      return { label: "Wisselend bewolkt", icon: "cloud-sun" };
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Zet de Open-Meteo-respons (`daily.time`, `daily.weather_code`,
 * `daily.temperature_2m_max/min`) om naar een lijst dagen. Ongeldige of
 * onvolledige responses geven een lege lijst — nooit een exception — zodat
 * het dashboard dan gewoon "verwachting niet beschikbaar" toont.
 */
export function parseForecastResponse(json: unknown): ForecastDay[] {
  if (typeof json !== "object" || json === null) return [];
  const daily = (json as { daily?: unknown }).daily;
  if (typeof daily !== "object" || daily === null) return [];

  const { time, weather_code, temperature_2m_max, temperature_2m_min } = daily as Record<
    string,
    unknown
  >;
  if (!Array.isArray(time) || !Array.isArray(weather_code)) return [];

  const days: ForecastDay[] = [];
  for (let index = 0; index < time.length; index++) {
    const date = time[index];
    const code = numberOrNull(weather_code[index]);
    if (typeof date !== "string" || code === null) continue;
    days.push({
      date,
      weatherCode: code,
      maxC: Array.isArray(temperature_2m_max) ? numberOrNull(temperature_2m_max[index]) : null,
      minC: Array.isArray(temperature_2m_min) ? numberOrNull(temperature_2m_min[index]) : null,
    });
  }
  return days.slice(0, FORECAST_DAYS);
}

export function buildForecastUrl(latitude: number, longitude: number, timeZone: string): string {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    daily: "weather_code,temperature_2m_max,temperature_2m_min",
    timezone: timeZone,
    forecast_days: String(FORECAST_DAYS),
  });
  return `https://api.open-meteo.com/v1/forecast?${params.toString()}`;
}

/**
 * Haalt de verwachting op. Gooit bij een netwerk-/HTTP-fout (de aanroeper in
 * forecast-card.tsx vangt dat af). Server-side gecachet voor 30 minuten:
 * een dagverwachting verandert niet sneller, en zo blijven we ver onder de
 * gratis limieten van Open-Meteo.
 */
export async function fetchForecast(
  latitude: number,
  longitude: number,
  timeZone: string,
): Promise<ForecastDay[]> {
  const response = await fetch(buildForecastUrl(latitude, longitude, timeZone), {
    next: { revalidate: 1800 },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Open-Meteo antwoordde met HTTP ${response.status}`);
  }
  return parseForecastResponse(await response.json());
}
